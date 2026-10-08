use std::io::{self, Read, Write};

fn main() -> io::Result<()> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    let response = if std::env::args().any(|argument| argument == "--world-command") {
        bropilot_core::handle_world_command(&input)
    } else {
        bropilot_core::handle_request(&input)
    };
    io::stdout().write_all(response.as_bytes())?;
    io::stdout().write_all(b"\n")
}
