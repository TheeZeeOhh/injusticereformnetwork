use std::process::{Command, Stdio, ChildStdin};
use std::io::{Write, BufReader, BufRead};
use std::sync::{Arc, Mutex};
use std::thread;

struct ZeeBridgeState {
    stdin: Mutex<Option<ChildStdin>>,
}

#[tauri::command]
fn zee_bridge_request(
    state: tauri::State<'_, ZeeBridgeState>,
    request: serde_json::Value,
) -> Result<(), String> {
    let mut stdin_guard = state.stdin.lock().unwrap();
    if let Some(stdin) = stdin_guard.as_mut() {
        let mut bytes = serde_json::to_vec(&request).map_err(|e| e.to_string())?;
        bytes.push(b'\n');
        stdin.write_all(&bytes).map_err(|e| e.to_string())?;
        stdin.flush().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Zee bridge sidecar is not running".into())
    }
}

fn spawn_zee_bridge(app: &tauri::App) {
    let app_handle = app.handle().clone();
    
    // Find the python script
    let paths = ["/opt/zee-zee/zee_bridge.py", &format!("{}/Desktop/code/zee_bridge.py", std::env::var("HOME").unwrap_or_default()), &format!("{}/vault/Desktop/code/zee_bridge.py", std::env::var("HOME").unwrap_or_default())];
    
    let mut script_path = None;
    for p in paths {
        if std::path::Path::new(p).exists() {
            script_path = Some(p.to_string());
            break;
        }
    }
    
    let script_path = match script_path {
        Some(p) => p,
        None => {
            eprintln!("zee_bridge.py not found, sidecar disabled");
            return;
        }
    };
    
    match Command::new("python3")
        .arg(&script_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .spawn()
    {
        Ok(mut child) => {
            let stdin = child.stdin.take().unwrap();
            let stdout = child.stdout.take().unwrap();
            
            // store stdin in app state
            let state = app_handle.state::<ZeeBridgeState>();
            *state.stdin.lock().unwrap() = Some(stdin);
            
            // read stdout
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    match line {
                        Ok(l) => {
                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&l) {
                                let _ = app_handle.emit("zee-bridge-response", json);
                            }
                        }
                        Err(_) => break,
                    }
                }
                println!("Zee bridge sidecar exited");
            });
        }
        Err(e) => {
            eprintln!("Failed to spawn zee_bridge.py: {}", e);
        }
    }
}
