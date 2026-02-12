package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/auth"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/handlers"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/middleware"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/protocol"
	"github.com/harmonyflow/syncbridge/session-state-service/internal/redis"
	goredis "github.com/redis/go-redis/v9"
	"go.uber.org/zap"
)

func main() {
	logger, err := zap.NewProduction()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create logger: %v\n", err)
		os.Exit(1)
	}
	defer logger.Sync()

	redisConfig := redis.Config{
		Addr:         getEnv("REDIS_ADDR", "localhost:6379"),
		Password:     getEnv("REDIS_PASSWORD", ""),
		DB:           0,
		PoolSize:     100,
		MinIdleConns: 10,
		MaxRetries:   3,
	}

	redisClient, err := redis.NewClient(redisConfig, logger)
	if err != nil {
		logger.Fatal("Failed to create Redis client", zap.Error(err))
	}
	defer redisClient.Close()

	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		logger.Fatal("JWT_SECRET environment variable is required")
	}
	if len(jwtSecret) < 32 {
		logger.Fatal("JWT_SECRET must be at least 32 characters long for security")
	}

	jwtRefreshSecret := os.Getenv("JWT_REFRESH_SECRET")
	if jwtRefreshSecret == "" {
		logger.Fatal("JWT_REFRESH_SECRET environment variable is required")
	}
	if len(jwtRefreshSecret) < 32 {
		logger.Fatal("JWT_REFRESH_SECRET must be at least 32 characters long for security")
	}

	authConfig := auth.Config{
		SecretKey:        jwtSecret,
		RefreshSecretKey: jwtRefreshSecret,
		TokenExpiry:      15 * time.Minute,
		RefreshExpiry:    7 * 24 * time.Hour,
	}
	authMiddleware := auth.NewMiddleware(authConfig, logger)

	if err := auth.LoadJWTSecretsFromEnv(logger); err != nil {
		logger.Fatal("Failed to load JWT secrets", zap.Error(err))
	}

	wsManager := protocol.NewManager(logger)
	go wsManager.Run()

	sessionHandler := handlers.NewSessionHandler(redisClient, wsManager, logger)
	wsHandler := handlers.NewWebSocketHandler(wsManager, redisClient, authMiddleware, logger)
	multiDeviceHandler := handlers.NewMultiDeviceHandler(redisClient, wsManager, logger)
	adminHandler := handlers.NewAdminHandler(redisClient, wsManager, logger)

	allowedOrigins := strings.Split(getEnv("ALLOWED_ORIGINS", "staging.harmonyflow.io,production.harmonyflow.io,http://localhost:3000"), ",")
	for i := range allowedOrigins {
		allowedOrigins[i] = strings.TrimSpace(allowedOrigins[i])
	}

	corsMiddleware := middleware.NewCORSMiddleware(middleware.CORSConfig{
		AllowedOrigins:   allowedOrigins,
		AllowCredentials: true,
		Debug:            getEnv("ENV", "production") == "development",
	}, logger)

	rawRedisClient := goredis.NewClient(&goredis.Options{
		Addr:         redisConfig.Addr,
		Password:     redisConfig.Password,
		DB:           redisConfig.DB,
		PoolSize:     redisConfig.PoolSize,
		MinIdleConns: redisConfig.MinIdleConns,
		MaxRetries:   redisConfig.MaxRetries,
	})
	if err := rawRedisClient.Ping(context.Background()).Err(); err != nil {
		logger.Fatal("Failed to connect to raw Redis client", zap.Error(err))
	}

	rateLimiter := middleware.NewRateLimiter(rawRedisClient, middleware.RateLimiterConfig{
		IPRequestsPerMinute:   100,
		UserRequestsPerMinute: 1000,
	}, logger)

	csrfMiddleware := middleware.NewCSRFMiddleware(redisClient, middleware.CSRFConfig{
		TokenLength:    32,
		TokenTTL:       24 * time.Hour,
		CookieName:     "csrf_token",
		HeaderName:     "X-CSRF-Token",
		SecureCookie:   getEnv("ENV", "production") == "production",
		SameSite:       "Lax",
		AllowedMethods: []string{"GET", "HEAD", "OPTIONS"},
	}, logger)

	adminAuthMiddleware := middleware.NewAdminAuthMiddleware(authMiddleware, middleware.AdminAuthConfig{
		AdminPathPrefix: "/admin",
	}, logger)

	rotationInterval := 24 * time.Hour
	if val := getEnv("JWT_KEY_ROTATION_INTERVAL", "24h"); val != "" {
		if d, err := time.ParseDuration(val); err == nil {
			rotationInterval = d
		}
	}
	auth.StartKeyRotation(rotationInterval, logger)
	defer auth.StopKeyRotation()

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(corsMiddleware.Middleware())
	router.Use(rateLimiter.Middleware())
	router.Use(csrfMiddleware.Middleware())
	router.Use(requestLogger(logger))

	router.GET("/health", sessionHandler.HealthCheck)
	router.POST("/session/snapshot", sessionHandler.CreateSnapshot)
	router.GET("/session/:uuid", sessionHandler.GetSnapshot)
	router.POST("/session/incremental", sessionHandler.ApplyIncrementalUpdate)
	router.POST("/session/conflict/resolve", sessionHandler.ResolveConflict)

	router.GET("/session/:uuid/devices", multiDeviceHandler.GetSessionDevices)
	router.POST("/session/:uuid/handoff", multiDeviceHandler.InitiateHandoff)
	router.GET("/session/:uuid/handoff/:token", multiDeviceHandler.ValidateHandoffToken)
	router.DELETE("/session/:uuid/device/:device_id", multiDeviceHandler.DisconnectDevice)

	adminGroup := router.Group("/admin")
	adminGroup.Use(adminAuthMiddleware.Middleware())
	{
		adminGroup.GET("/metrics/sessions", adminHandler.GetSessionMetrics)
		adminGroup.GET("/metrics/connections", adminHandler.GetConnectionMetrics)
		adminGroup.GET("/metrics/snapshots", adminHandler.GetSnapshotMetrics)
		adminGroup.GET("/metrics/all", adminHandler.GetAllMetrics)
		adminGroup.GET("/sessions", adminHandler.GetActiveSessions)
		adminGroup.GET("/connections", adminHandler.GetActiveConnections)
		adminGroup.POST("/broadcast", adminHandler.BroadcastAdminMessage)
	}

	router.GET("/ws", wsHandler.HandleConnection)

	srv := &http.Server{
		Addr:         getEnv("SERVER_ADDR", ":8080"),
		Handler:      router,
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		logger.Info("Starting server", zap.String("addr", srv.Addr))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Server failed to start", zap.Error(err))
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatal("Server forced to shutdown", zap.Error(err))
	}

	logger.Info("Server exited")
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func requestLogger(logger *zap.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery

		c.Next()

		latency := time.Since(start)
		clientIP := c.ClientIP()
		method := c.Request.Method
		statusCode := c.Writer.Status()

		if raw != "" {
			path = path + "?" + raw
		}

		logger.Info("Request",
			zap.String("client_ip", clientIP),
			zap.String("method", method),
			zap.String("path", path),
			zap.Int("status", statusCode),
			zap.Duration("latency", latency),
		)
	}
}
