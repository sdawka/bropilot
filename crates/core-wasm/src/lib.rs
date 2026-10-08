use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[must_use]
pub fn query(input: &str) -> String {
    bropilot_core::handle_request(input)
}

#[wasm_bindgen]
#[must_use]
pub fn world_command(input: &str) -> String {
    bropilot_core::handle_world_command(input)
}

#[cfg(test)]
mod tests {
    #[test]
    fn forwards_json_to_the_pure_core() {
        let response = super::query("not json");
        assert!(response.contains("malformed_request"));
    }

    #[test]
    fn forwards_world_commands_to_the_pure_core() {
        let response = super::world_command("not json");
        assert!(response.contains("malformed_request"));
    }
}
