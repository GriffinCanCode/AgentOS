/**
 * AI-OS Kernel - Main Entry Point
 * 
 * Lightweight microkernel that provides:
 * - Process management
 * - Memory management  
 * - IPC with AI service
 * - Hardware abstraction
 */

use log::info;
use std::error::Error;
use std::path::PathBuf;

use ai_os_kernel::{
    ProcessManager, MemoryManager, IPCManager,
    SandboxManager, SandboxConfig, Capability,
    SyscallExecutor, Syscall, start_grpc_server
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    // Initialize logger
    env_logger::Builder::from_default_env()
        .filter_level(log::LevelFilter::Info)
        .init();

    info!("🚀 AI-OS Kernel starting...");
    info!("================================================");
    
    // Initialize kernel subsystems
    info!("Initializing memory manager...");
    let _memory_manager = MemoryManager::new();
    
    info!("Initializing process manager...");
    let process_manager = ProcessManager::new();
    
    info!("Initializing IPC system...");
    let _ipc_manager = IPCManager::new();
    
    info!("Initializing sandbox manager...");
    let sandbox_manager = SandboxManager::new();
    
    info!("Initializing syscall executor...");
    let syscall_executor = SyscallExecutor::new(sandbox_manager.clone());
    
    info!("✅ Kernel initialization complete");
    info!("================================================");
    
    // Demo: Create a test process with sandboxing
    demo_sandboxed_execution(&process_manager, &sandbox_manager, &syscall_executor);
    
    info!("Kernel entering main loop...");
    info!("Press Ctrl+C to exit");
    
    // Start gRPC server in parallel with main loop
    let grpc_addr = "0.0.0.0:50051".parse().unwrap();
    let grpc_syscall_executor = syscall_executor.clone();
    let grpc_process_manager = process_manager.clone();
    let grpc_sandbox_manager = sandbox_manager.clone();
    
    info!("Starting gRPC server on {}", grpc_addr);
    
    // Spawn gRPC server as a background task
    tokio::spawn(async move {
        if let Err(e) = start_grpc_server(
            grpc_addr,
            grpc_syscall_executor,
            grpc_process_manager,
            grpc_sandbox_manager,
        )
        .await
        {
            log::error!("gRPC server error: {}", e);
        }
    });
    
    info!("✅ gRPC server started");
    info!("Kernel is ready to receive syscalls from AI service");
    
    // Kernel main loop
    loop {
        // Monitor system state
        tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
    }
}

/// Demonstration of sandboxed execution
fn demo_sandboxed_execution(
    process_manager: &ProcessManager,
    sandbox_manager: &SandboxManager,
    syscall_executor: &SyscallExecutor,
) {
    info!("Running sandboxed execution demo...");
    info!("-----------------------------------");
    
    // Create a test process
    let pid = process_manager.create_process("test-app".to_string(), 5);
    
    // Create a standard sandbox for it
    let mut sandbox_config = SandboxConfig::standard(pid);
    sandbox_config.allow_path(PathBuf::from("/tmp"));
    sandbox_manager.create_sandbox(sandbox_config);
    
    // Test 1: Allowed file read (should succeed)
    info!("\n[Test 1] Attempting allowed file operation...");
    let result = syscall_executor.execute(
        pid,
        Syscall::FileExists { path: PathBuf::from("/tmp/test.txt") }
    );
    info!("Result: {:?}", result);
    
    // Test 2: Blocked file read (should fail)
    info!("\n[Test 2] Attempting blocked file operation...");
    let result = syscall_executor.execute(
        pid,
        Syscall::ReadFile { path: PathBuf::from("/etc/passwd") }
    );
    info!("Result: {:?}", result);
    
    // Test 3: Missing capability (should fail)
    info!("\n[Test 3] Attempting operation without capability...");
    let result = syscall_executor.execute(
        pid,
        Syscall::SpawnProcess {
            command: "echo".to_string(),
            args: vec!["hello".to_string()]
        }
    );
    info!("Result: {:?}", result);
    
    // Test 4: System info (should succeed)
    info!("\n[Test 4] Attempting allowed system info...");
    let result = syscall_executor.execute(pid, Syscall::GetSystemInfo);
    info!("Result: {:?}", result);
    
    info!("-----------------------------------");
    info!("Sandboxed execution demo complete!");
    info!("");
}

