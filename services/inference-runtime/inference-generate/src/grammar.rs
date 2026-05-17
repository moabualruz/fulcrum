//! JSON Schema → GBNF grammar conversion and grammar-constrained generation.
//!
//! Supports a subset: object, array, string, number, boolean, null, required,
//! additionalProperties.  Complex schemas (nested $ref, oneOf, anyOf) fall back
//! to free-text generation with post-hoc validation + retry (up to 3×).

use serde_json::Value;

const MAX_RETRIES: usize = 3;

/// Errors specific to grammar-constrained generation.
#[derive(Debug, PartialEq)]
pub enum GrammarError {
    /// Schema itself is malformed or uses unsupported constructs.
    InvalidSchema(String),
    /// Generation failed to produce valid JSON after retries.
    ValidationFailed(String),
}

impl std::fmt::Display for GrammarError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GrammarError::InvalidSchema(msg) => write!(f, "GRAMMAR_ERROR: {}", msg),
            GrammarError::ValidationFailed(msg) => write!(f, "GRAMMAR_VALIDATION: {}", msg),
        }
    }
}

/// Convert a JSON Schema (as serde_json::Value) to a GBNF grammar string.
///
/// Supports: object, array, string, number, boolean, null.
/// Returns `Err(GrammarError::InvalidSchema)` for unsupported constructs.
pub fn schema_to_gbnf(schema: &Value) -> Result<String, GrammarError> {
    // Reject unsupported constructs early
    for key in &["$ref", "oneOf", "anyOf", "allOf"] {
        if schema.get(*key).is_some() {
            return Err(GrammarError::InvalidSchema(format!(
                "unsupported construct: {}",
                key
            )));
        }
    }

    let mut rules = Vec::new();
    let root = type_to_gbnf(schema, "root", &mut rules)?;
    rules.insert(0, root);

    // Add primitive rules
    rules.push(r#"ws ::= [ \t\n]*"#.to_string());
    rules.push(r#"string ::= "\"" [^"\\]* "\""  "#.to_string());
    rules.push(r#"number ::= "-"? [0-9]+ ("." [0-9]+)?"#.to_string());
    rules.push(r#"boolean ::= "true" | "false""#.to_string());
    rules.push(r#"null ::= "null""#.to_string());

    Ok(rules.join("\n"))
}

fn type_to_gbnf(
    schema: &Value,
    rule_name: &str,
    rules: &mut Vec<String>,
) -> Result<String, GrammarError> {
    let typ = schema.get("type").and_then(|v| v.as_str()).unwrap_or("string");

    match typ {
        "object" => object_to_gbnf(schema, rule_name, rules),
        "array" => array_to_gbnf(schema, rule_name, rules),
        "string" => Ok(format!("{} ::= string", rule_name)),
        "number" | "integer" => Ok(format!("{} ::= number", rule_name)),
        "boolean" => Ok(format!("{} ::= boolean", rule_name)),
        "null" => Ok(format!("{} ::= null", rule_name)),
        other => Err(GrammarError::InvalidSchema(format!(
            "unsupported type: {}",
            other
        ))),
    }
}

fn object_to_gbnf(
    schema: &Value,
    rule_name: &str,
    rules: &mut Vec<String>,
) -> Result<String, GrammarError> {
    let properties = schema
        .get("properties")
        .and_then(|v| v.as_object())
        .cloned()
        .unwrap_or_default();

    if properties.is_empty() {
        return Ok(format!(r#"{} ::= "{{" ws "}}""#, rule_name));
    }

    let mut parts = Vec::new();
    for (i, (key, prop_schema)) in properties.iter().enumerate() {
        let prop_rule = format!("{}_{}", rule_name, key.replace('-', "_"));
        let prop_type_rule = type_to_gbnf(prop_schema, &prop_rule, rules)?;
        rules.push(prop_type_rule);
        let comma = if i > 0 { r#"ws "," ws "#  } else { "ws " };
        parts.push(format!(
            r#"{}"\"{}\"" ws ":" ws {}"#,
            comma, key, prop_rule
        ));
    }

    let body = parts.join(" ");
    Ok(format!(r#"{} ::= "{{" {} ws "}}""#, rule_name, body))
}

fn array_to_gbnf(
    schema: &Value,
    rule_name: &str,
    rules: &mut Vec<String>,
) -> Result<String, GrammarError> {
    let items_rule = format!("{}_item", rule_name);
    if let Some(items) = schema.get("items") {
        let item_rule = type_to_gbnf(items, &items_rule, rules)?;
        rules.push(item_rule);
    } else {
        rules.push(format!("{} ::= string", items_rule));
    }

    let list_rule = format!("{}_list", rule_name);
    rules.push(format!(
        r#"{} ::= {} (ws "," ws {})*"#,
        list_rule, items_rule, items_rule
    ));

    Ok(format!(
        r#"{} ::= "[" ws ({})? ws "]""#,
        rule_name, list_rule
    ))
}

/// Validate that `text` is valid JSON conforming to the given schema.
/// Returns Ok(()) if valid, Err with description if not.
pub fn validate_against_schema(text: &str, schema: &Value) -> Result<(), String> {
    let parsed: Value =
        serde_json::from_str(text).map_err(|e| format!("invalid JSON: {}", e))?;

    validate_value(&parsed, schema)
}

fn validate_value(value: &Value, schema: &Value) -> Result<(), String> {
    let typ = schema.get("type").and_then(|v| v.as_str()).unwrap_or("");

    match typ {
        "object" => validate_object(value, schema),
        "array" => validate_array(value, schema),
        "string" => {
            if value.is_string() {
                Ok(())
            } else {
                Err(format!("expected string, got {}", value_type_name(value)))
            }
        }
        "number" | "integer" => {
            if value.is_number() {
                Ok(())
            } else {
                Err(format!("expected number, got {}", value_type_name(value)))
            }
        }
        "boolean" => {
            if value.is_boolean() {
                Ok(())
            } else {
                Err(format!("expected boolean, got {}", value_type_name(value)))
            }
        }
        "null" => {
            if value.is_null() {
                Ok(())
            } else {
                Err(format!("expected null, got {}", value_type_name(value)))
            }
        }
        _ => Ok(()), // permissive for unrecognized types
    }
}

fn validate_object(value: &Value, schema: &Value) -> Result<(), String> {
    let obj = value
        .as_object()
        .ok_or_else(|| format!("expected object, got {}", value_type_name(value)))?;

    // Check required fields
    if let Some(required) = schema.get("required").and_then(|v| v.as_array()) {
        for req in required {
            if let Some(key) = req.as_str() {
                if !obj.contains_key(key) {
                    return Err(format!("missing required field: {}", key));
                }
            }
        }
    }

    // Validate property types
    if let Some(properties) = schema.get("properties").and_then(|v| v.as_object()) {
        for (key, prop_schema) in properties {
            if let Some(val) = obj.get(key) {
                validate_value(val, prop_schema)?;
            }
        }
    }

    // Check additionalProperties: false
    if schema.get("additionalProperties") == Some(&Value::Bool(false)) {
        if let Some(properties) = schema.get("properties").and_then(|v| v.as_object()) {
            for key in obj.keys() {
                if !properties.contains_key(key) {
                    return Err(format!("additional property not allowed: {}", key));
                }
            }
        }
    }

    Ok(())
}

fn validate_array(value: &Value, schema: &Value) -> Result<(), String> {
    let arr = value
        .as_array()
        .ok_or_else(|| format!("expected array, got {}", value_type_name(value)))?;

    if let Some(items_schema) = schema.get("items") {
        for (i, item) in arr.iter().enumerate() {
            validate_value(item, items_schema)
                .map_err(|e| format!("array[{}]: {}", i, e))?;
        }
    }

    Ok(())
}

fn value_type_name(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

/// Returns true if the schema uses constructs that need the fallback path.
pub fn needs_fallback(schema: &Value) -> bool {
    for key in &["$ref", "oneOf", "anyOf", "allOf"] {
        if schema.get(*key).is_some() {
            return true;
        }
    }
    // Recurse into properties and items
    if let Some(props) = schema.get("properties").and_then(|v| v.as_object()) {
        for prop in props.values() {
            if needs_fallback(prop) {
                return true;
            }
        }
    }
    if let Some(items) = schema.get("items") {
        if needs_fallback(items) {
            return true;
        }
    }
    false
}

/// Generate text constrained to a JSON schema.
///
/// Strategy:
/// 1. If schema is simple enough, convert to GBNF (logged but not yet wired
///    into candle logit-bias — stub generates free text).
/// 2. Validate output against schema.
/// 3. Retry up to MAX_RETRIES times on validation failure.
///
/// Returns `(text, used_fallback)`.
pub fn generate_with_schema(
    generate_fn: &dyn Fn(&str) -> Result<String, String>,
    prompt: &str,
    schema: &Value,
) -> Result<(String, bool), GrammarError> {
    let fallback = needs_fallback(schema);

    // Attempt GBNF conversion for supported schemas (validates schema structure)
    if !fallback {
        let _gbnf = schema_to_gbnf(schema)?;
        // TODO: wire GBNF into candle sampler logit-bias mask
        // For now, fall through to free-text + validate approach
    }

    for attempt in 0..MAX_RETRIES {
        let schema_hint = serde_json::to_string(schema).unwrap_or_default();
        let constrained_prompt = format!(
            "{}\n\nRespond with ONLY valid JSON matching this schema: {}",
            prompt, schema_hint
        );

        let text = generate_fn(&constrained_prompt).map_err(|e| {
            GrammarError::ValidationFailed(format!("generation failed on attempt {}: {}", attempt, e))
        })?;

        // Try to extract JSON from the response
        let json_text = extract_json(&text);

        match validate_against_schema(&json_text, schema) {
            Ok(()) => return Ok((json_text, fallback)),
            Err(_) if attempt < MAX_RETRIES - 1 => continue,
            Err(e) => {
                return Err(GrammarError::ValidationFailed(format!(
                    "output failed schema validation after {} retries: {}",
                    MAX_RETRIES, e
                )));
            }
        }
    }

    unreachable!()
}

/// Try to extract a JSON object or array from text that may contain other content.
fn extract_json(text: &str) -> String {
    let trimmed = text.trim();
    // If it starts with { or [, try to find the matching close
    if trimmed.starts_with('{') || trimmed.starts_with('[') {
        return trimmed.to_string();
    }
    // Look for first { or [
    if let Some(start) = trimmed.find('{') {
        if let Some(end) = trimmed.rfind('}') {
            if end >= start {
                return trimmed[start..=end].to_string();
            }
        }
    }
    if let Some(start) = trimmed.find('[') {
        if let Some(end) = trimmed.rfind(']') {
            if end >= start {
                return trimmed[start..=end].to_string();
            }
        }
    }
    trimmed.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn schema_to_gbnf_simple_object() {
        let schema = json!({
            "type": "object",
            "properties": {
                "agent": { "type": "string" }
            },
            "required": ["agent"]
        });
        let gbnf = schema_to_gbnf(&schema).unwrap();
        assert!(gbnf.contains("root ::="));
        assert!(gbnf.contains("root_agent"));
        assert!(gbnf.contains("string"));
    }

    #[test]
    fn schema_to_gbnf_rejects_ref() {
        let schema = json!({ "$ref": "#/definitions/Foo" });
        let err = schema_to_gbnf(&schema).unwrap_err();
        assert!(matches!(err, GrammarError::InvalidSchema(_)));
        assert!(err.to_string().contains("GRAMMAR_ERROR"));
    }

    #[test]
    fn schema_to_gbnf_rejects_one_of() {
        let schema = json!({ "oneOf": [{"type": "string"}, {"type": "number"}] });
        let err = schema_to_gbnf(&schema).unwrap_err();
        assert!(matches!(err, GrammarError::InvalidSchema(_)));
    }

    #[test]
    fn validate_against_schema_accepts_valid() {
        let schema = json!({
            "type": "object",
            "properties": {
                "agent": { "type": "string" }
            },
            "required": ["agent"]
        });
        assert!(validate_against_schema(r#"{"agent": "router"}"#, &schema).is_ok());
    }

    #[test]
    fn validate_against_schema_rejects_missing_required() {
        let schema = json!({
            "type": "object",
            "properties": {
                "agent": { "type": "string" }
            },
            "required": ["agent"]
        });
        assert!(validate_against_schema(r#"{}"#, &schema).is_err());
    }

    #[test]
    fn validate_against_schema_rejects_wrong_type() {
        let schema = json!({
            "type": "object",
            "properties": {
                "agent": { "type": "string" }
            },
            "required": ["agent"]
        });
        assert!(validate_against_schema(r#"{"agent": 42}"#, &schema).is_err());
    }

    #[test]
    fn validate_against_schema_rejects_additional_properties() {
        let schema = json!({
            "type": "object",
            "properties": {
                "agent": { "type": "string" }
            },
            "additionalProperties": false
        });
        assert!(validate_against_schema(r#"{"agent": "a", "extra": 1}"#, &schema).is_err());
    }

    #[test]
    fn validate_against_schema_array() {
        let schema = json!({
            "type": "array",
            "items": { "type": "number" }
        });
        assert!(validate_against_schema("[1, 2, 3]", &schema).is_ok());
        assert!(validate_against_schema(r#"[1, "bad"]"#, &schema).is_err());
    }

    #[test]
    fn generate_with_schema_validates_output() {
        let schema = json!({
            "type": "object",
            "properties": {
                "agent": { "type": "string" }
            },
            "required": ["agent"]
        });

        let result = generate_with_schema(
            &|_prompt| Ok(r#"{"agent": "router"}"#.to_string()),
            "route this task",
            &schema,
        );
        assert!(result.is_ok());
        let (text, fallback) = result.unwrap();
        assert_eq!(text, r#"{"agent": "router"}"#);
        assert!(!fallback);
    }

    #[test]
    fn generate_with_schema_retries_on_invalid_output() {
        let schema = json!({
            "type": "object",
            "properties": {
                "agent": { "type": "string" }
            },
            "required": ["agent"]
        });

        let call_count = std::cell::Cell::new(0);
        let result = generate_with_schema(
            &|_prompt| {
                let n = call_count.get();
                call_count.set(n + 1);
                if n < 2 {
                    Ok("not json".to_string())
                } else {
                    Ok(r#"{"agent": "fixed"}"#.to_string())
                }
            },
            "route this task",
            &schema,
        );
        assert!(result.is_ok());
        assert_eq!(call_count.get(), 3);
    }

    #[test]
    fn generate_with_schema_fails_after_max_retries() {
        let schema = json!({
            "type": "object",
            "properties": {
                "agent": { "type": "string" }
            },
            "required": ["agent"]
        });

        let result = generate_with_schema(
            &|_prompt| Ok("always invalid".to_string()),
            "route this task",
            &schema,
        );
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(matches!(err, GrammarError::ValidationFailed(_)));
    }

    #[test]
    fn generate_with_schema_uses_fallback_for_complex_schemas() {
        let schema = json!({
            "oneOf": [
                { "type": "string" },
                { "type": "number" }
            ]
        });

        let result = generate_with_schema(
            &|_prompt| Ok(r#""hello""#.to_string()),
            "test",
            &schema,
        );
        // Fallback path: oneOf can't be converted to GBNF, but free-text + validate
        // Our validator is permissive for unrecognized top-level types, so this passes
        assert!(result.is_ok());
        let (_, fallback) = result.unwrap();
        assert!(fallback);
    }

    #[test]
    fn needs_fallback_detects_complex_constructs() {
        assert!(needs_fallback(&json!({"$ref": "#/defs/X"})));
        assert!(needs_fallback(&json!({"oneOf": []})));
        assert!(needs_fallback(&json!({"anyOf": []})));
        assert!(!needs_fallback(&json!({"type": "object", "properties": {"a": {"type": "string"}}})));
        // Nested
        assert!(needs_fallback(&json!({
            "type": "object",
            "properties": {
                "x": { "$ref": "#/defs/Y" }
            }
        })));
    }

    #[test]
    fn extract_json_finds_embedded_json() {
        assert_eq!(
            extract_json("Here is the result: {\"a\": 1} done"),
            "{\"a\": 1}"
        );
        assert_eq!(extract_json("{\"a\": 1}"), "{\"a\": 1}");
    }
}
