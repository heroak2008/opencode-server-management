# Planning Guide

A distributed task management system that orchestrates code analysis tasks across multiple OpenCode Server workers, enabling parallel execution of repository-wide operations.

**Experience Qualities**:
1. **Professional** - Enterprise-grade interface with clear status indicators and reliable task orchestration
2. **Efficient** - Streamlined workflows for configuring workers, creating tasks, and monitoring execution with minimal friction
3. **Transparent** - Real-time visibility into worker health, task progress, and system performance

**Complexity Level**: Complex Application (advanced functionality, likely with multiple views)
This is a complex distributed system management tool that requires multiple interconnected views (worker management, task configuration, status monitoring), real-time state synchronization, and sophisticated task orchestration logic with parallel execution capabilities.

## Essential Features

### Worker Registration
- **Functionality**: Register and manage OpenCode Server workers by IP and port
- **Purpose**: Build a pool of available workers for distributed task execution
- **Trigger**: User clicks "Add Worker" button
- **Progression**: Click Add Worker → Enter IP/Port → Test Connection → Save → Worker appears in registry with status
- **Success criteria**: Worker appears in list with online/offline status, connection test succeeds, worker can receive tasks

### Task Configuration
- **Functionality**: Create tasks with multiple subtasks, configure parallelization and worker assignment
- **Purpose**: Enable complex code analysis operations to be broken down and distributed across workers
- **Trigger**: User clicks "Create Task" button
- **Progression**: Click Create Task → Select task type (code check/other) → Define subtasks (directories/files) → Configure concurrency → Assign workers → Submit → Task queued
- **Success criteria**: Task saved with all subtasks defined, concurrency settings applied, ready for execution

### Task Execution Management
- **Functionality**: Start/pause/cancel tasks, automatic worker assignment, subtask distribution
- **Purpose**: Control task lifecycle and enable efficient parallel execution
- **Trigger**: User clicks "Start" on a configured task
- **Progression**: Click Start → System assigns subtasks to available workers → Workers execute → Progress updates → Completion or error handling
- **Success criteria**: Subtasks distributed evenly, parallel execution respects concurrency limits, progress updates in real-time

### Worker Status Monitoring
- **Functionality**: Real-time display of worker health, current tasks, resource usage
- **Purpose**: Ensure workers are healthy and identify bottlenecks
- **Trigger**: Dashboard loads or user navigates to Workers view
- **Progression**: Load view → Fetch worker status → Display health/tasks/metrics → Auto-refresh → Alert on failures
- **Success criteria**: Worker status accurate within 5 seconds, failed workers highlighted, reconnection attempted automatically

### Task Status Dashboard
- **Functionality**: View all tasks with execution status, progress, logs, and results
- **Purpose**: Monitor task execution and debug failures
- **Trigger**: Dashboard loads or user navigates to Tasks view
- **Progression**: Load view → Fetch task list → Display status/progress → Click task → View subtask details → Access logs/results
- **Success criteria**: All tasks visible with accurate status, progress bars update in real-time, logs accessible per subtask

## Edge Case Handling

- **Worker Disconnection**: Automatically detect offline workers, pause affected tasks, redistribute to healthy workers
- **Task Failure**: Capture error logs, allow retry of failed subtasks, mark partial completion
- **Concurrent Task Limits**: Prevent over-subscription by respecting worker capacity and global concurrency settings
- **Empty States**: Guide users to add workers when none exist, suggest creating tasks when list is empty
- **Network Errors**: Display clear error messages for connection failures, provide retry mechanisms
- **Invalid Configuration**: Validate IP/Port format, check for duplicate workers, ensure subtasks have valid targets

## Design Direction

The design should evoke a sense of technical precision and operational control - like a mission control center for code analysis. Users should feel confident and informed, with visual clarity that distinguishes healthy/warning/error states immediately. The interface should balance dense information display with breathing room for critical metrics.

## Color Selection

A technical, high-contrast scheme inspired by developer tools and monitoring dashboards, emphasizing status clarity.

- **Primary Color**: Deep Tech Blue (oklch(0.35 0.15 250)) - Conveys reliability and technical sophistication, used for primary actions and active states
- **Secondary Colors**: 
  - Slate Gray (oklch(0.25 0.02 250)) - Professional background tone for cards and panels
  - Cool Gray (oklch(0.85 0.01 250)) - Light backgrounds and subtle separators
- **Accent Color**: Electric Cyan (oklch(0.75 0.18 200)) - High-tech highlight for active workers, running tasks, and CTAs
- **Status Colors**:
  - Success Green (oklch(0.65 0.18 145)) - Completed tasks, healthy workers
  - Warning Amber (oklch(0.75 0.15 70)) - Tasks in progress, warnings
  - Error Red (oklch(0.60 0.22 25)) - Failed tasks, offline workers
  - Idle Gray (oklch(0.55 0.02 250)) - Queued tasks, inactive states
- **Foreground/Background Pairings**:
  - Primary (Deep Tech Blue oklch(0.35 0.15 250)): White text (oklch(0.98 0 0)) - Ratio 8.2:1 ✓
  - Accent (Electric Cyan oklch(0.75 0.18 200)): Dark text (oklch(0.15 0 0)) - Ratio 12.1:1 ✓
  - Success (Green oklch(0.65 0.18 145)): White text (oklch(0.98 0 0)) - Ratio 5.8:1 ✓
  - Error (Red oklch(0.60 0.22 25)): White text (oklch(0.98 0 0)) - Ratio 4.9:1 ✓
  - Background (Cool Gray oklch(0.96 0.005 250)): Dark text (oklch(0.15 0 0)) - Ratio 17.2:1 ✓

## Font Selection

Typography should convey technical precision with excellent readability for dense data displays and code references.

- **Primary Font**: JetBrains Mono - Monospace font brings a technical, code-centric aesthetic perfect for displaying IPs, ports, and task IDs
- **Secondary Font**: Space Grotesk - Modern geometric sans for UI labels and descriptions, pairs well with monospace

- **Typographic Hierarchy**:
  - H1 (Page Title): Space Grotesk Bold/32px/tight tracking
  - H2 (Section Header): Space Grotesk SemiBold/24px/normal tracking
  - H3 (Card Title): Space Grotesk Medium/18px/normal tracking
  - Body (General Text): Space Grotesk Regular/15px/relaxed line-height (1.6)
  - Code/Data (IPs, IDs, Status): JetBrains Mono Regular/14px/normal tracking
  - Small Labels: Space Grotesk Medium/13px/wide tracking (uppercase)

## Animations

Animations should emphasize system responsiveness and state transitions - status changes should feel immediate and meaningful.

- **Status Changes**: Smooth color transitions (300ms) when worker/task status updates, with subtle pulse effect on critical alerts
- **Progress Indicators**: Linear progress bars with gradient shimmer effect during active execution
- **List Updates**: Gentle fade-in (200ms) for new tasks/workers, slide-out (250ms) for deletions
- **Loading States**: Subtle skeleton screens with wave animation for data fetching
- **Interactive Feedback**: Micro-interactions on buttons (100ms scale) and hover states with color shifts
- **Real-time Updates**: Gentle highlight flash (500ms fade) when status data refreshes

## Component Selection

- **Components**:
  - **Card**: Worker cards, task cards with distinct header sections for status
  - **Badge**: Status indicators (online/offline, running/completed/failed)
  - **Table**: Task list view with sortable columns, subtask breakdowns
  - **Dialog**: Add worker form, create task wizard, task configuration
  - **Tabs**: Switch between Workers/Tasks/Monitoring views
  - **Progress**: Linear progress bars for task completion, circular for worker load
  - **Form**: Worker registration, task creation with validation
  - **Button**: Primary (Start Task), Secondary (Configure), Destructive (Cancel Task)
  - **Input**: IP address, port number with format validation
  - **Select**: Task type dropdown, worker assignment
  - **Separator**: Visual division between sections and list items
  - **ScrollArea**: Long lists of workers/tasks/logs
  - **Alert**: System notifications for worker failures, task completions

- **Customizations**:
  - **Status Indicator Component**: Custom component combining Badge + dot indicator with pulse animation for active states
  - **Worker Card**: Custom layout with connection status, current load, and quick actions
  - **Task Timeline**: Custom component showing subtask execution sequence with parallel indicators
  - **Metric Display**: Large number displays with trend indicators for dashboard overview

- **States**:
  - **Buttons**: Hover with color shift + subtle lift, active with scale down, disabled with 40% opacity
  - **Inputs**: Focus with accent color ring, error with red ring + shake animation
  - **Cards**: Hover with subtle elevation increase, selected with accent border
  - **Status Badges**: Pulsing animation for "running" state, static for completed/failed

- **Icon Selection**:
  - Server (Worker nodes)
  - Play (Start task)
  - Pause (Pause task)
  - X (Cancel task)
  - Plus (Add worker/task)
  - CheckCircle (Success status)
  - Warning (Warning status)
  - XCircle (Error status)
  - Clock (Queued status)
  - Activity (Monitoring/metrics)
  - List (Task list view)
  - FolderOpen (Directory targets)

- **Spacing**:
  - Container padding: p-6 (24px)
  - Card padding: p-4 (16px)
  - Section gaps: gap-6 (24px)
  - List item gaps: gap-3 (12px)
  - Form field gaps: gap-4 (16px)
  - Button padding: px-4 py-2

- **Mobile**:
  - Tabs convert to bottom navigation on mobile
  - Cards stack vertically with full width
  - Table converts to card list view with key info
  - Dialog forms adjust to single column
  - Reduce padding to p-4 on containers
  - Hide secondary metrics, show on expand
  - Sticky header with primary actions
