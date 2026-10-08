use std::io::Write;
use std::process::{Command, Stdio};

#[test]
fn reads_one_request_from_stdin_and_writes_one_response() {
    let mut child = Command::new(env!("CARGO_BIN_EXE_bropilot-query"))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
        .expect("query binary starts");
    child
        .stdin
        .take()
        .expect("stdin")
        .write_all(b"not json")
        .expect("request writes");
    let output = child.wait_with_output().expect("query binary exits");

    assert!(output.status.success());
    let response: serde_json::Value =
        serde_json::from_slice(&output.stdout).expect("JSON response");
    assert_eq!(response["status"], "error");
    assert_eq!(response["code"], "malformed_request");
}
