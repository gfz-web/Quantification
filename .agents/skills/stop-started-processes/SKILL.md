---
name: stop-started-processes
description: Track and clean up local processes started by Codex. Use whenever Codex starts or may start a dev server, watcher, background shell command, browser/test helper, package script, or other long-running local process; record what was started, stop every process before the final response/session end, and verify cleanup unless the user explicitly asks to keep it running.
---

# Stop Started Processes

## Rule

If you start a local process, own its lifecycle. Before ending the turn or session, stop every long-running process you started unless the user explicitly asked to keep it running.

## Workflow

1. Before starting, decide whether the command is expected to exit on its own. Treat dev servers, file watchers, background helpers, browser drivers, and long-running package scripts as processes that require cleanup.
2. Start long-running processes in a trackable way. Prefer a command form that exposes a PID and makes the working directory, arguments, logs, and port obvious.
3. Record each started process in your working notes: command, cwd, purpose, PID or process handle, port or URL if relevant, and any log file.
4. Use the process only as long as needed for implementation or verification.
5. Before the final response, stop all processes you started. Stop gracefully when practical, then force-stop only if the process does not exit.
6. Verify cleanup with the available local tooling, such as checking the PID is gone or the relevant port is no longer owned.
7. If a process cannot be stopped, tell the user plainly which command/PID remains and what was attempted.

## Windows PowerShell Notes

- Prefer `Start-Process ... -PassThru -WindowStyle Hidden` for background helpers so the PID is available.
- Use `Stop-Process -Id <pid>` to stop a recorded process.
- When a package manager launches child processes, also check for the child server process if the original wrapper exits or fails to stop the server.
- Do not leave a dev server running merely to provide a URL. If the user needs a live process after the response, get or rely on explicit user permission and report the command, PID, URL, and cleanup expectation.

## Final Response Checklist

- All processes started by Codex during the task are stopped, or the user explicitly asked to keep them running.
- Cleanup was verified.
- Any exception is reported with the command, PID, and reason it remains running.
