use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[must_use]
pub fn query(input: &str) -> String {
    bropilot_core::handle_request(input)
}

#[cfg(test)]
mod tests {
    #[test]
    fn forwards_json_to_the_pure_core() {
        let response = super::query("not json");
        assert!(response.contains("malformed_request"));
    }
}
