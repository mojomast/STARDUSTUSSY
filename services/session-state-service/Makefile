.PHONY: all build test clean run docker-build docker-run security lint-fmt

# Default target
all: build

# Build the application
build:
	go build -o bin/session-state-service ./cmd/main.go

# Run tests
test:
	go test -v ./...

# Run tests with coverage
test-coverage:
	go test -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html

# Clean build artifacts
clean:
	rm -rf bin/
	rm -f coverage.out coverage.html

# Run the application locally
run:
	go run ./cmd/main.go

# Run with Redis using docker-compose
run-dev:
	docker-compose up --build

# Stop dev environment
stop-dev:
	docker-compose down

# Build Docker image
docker-build:
	docker build -t session-state-service:latest .

# Run Docker container
docker-run:
	docker run -p 8080:8080 \
		-e REDIS_ADDR=host.docker.internal:6379 \
		-e JWT_SECRET=dev-secret \
		session-state-service:latest

# Format code
fmt:
	go fmt ./...

# Run linter
lint:
	golangci-lint run

# Run security scan with gosec
security:
	gosec ./...

# Download dependencies
deps:
	go mod download
	go mod tidy

# Run benchmarks
bench:
	go test -bench=. -benchmem ./...

# Generate proto files (if protoc is installed)
proto:
	protoc --go_out=. --go_opt=paths=source_relative proto/session.proto

# Lint and format code
lint-fmt:
	gofmt -s -w .
	go vet ./...
