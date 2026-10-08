use std::io::{self, Read, Write};

fn main() -> io::Result<()> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input)?;
    let response = bropilot_core::handle_request(&input);
    io::stdout().write_all(response.as_bytes())?;
    io::stdout().write_all(b"\n")
}
