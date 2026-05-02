use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize)]
pub struct Request {
    pub jsonrpc: String,
    pub id: Option<Value>,
    pub method: String,
    #[serde(default)]
    pub params: Value,
}

#[derive(Debug, Serialize)]
pub struct Response {
    pub jsonrpc: String,
    pub id: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<RpcError>,
}

#[derive(Debug, Serialize)]
pub struct RpcError {
    pub code: i32,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
}

#[derive(Debug, Serialize)]
pub struct HealthResult {
    pub status: String,
    pub backends: Vec<String>,
    pub models: Vec<String>,
}

impl Response {
    pub fn success(id: Option<Value>, result: impl Serialize) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: Some(serde_json::to_value(result).expect("result must be serializable")),
            error: None,
        }
    }

    pub fn error(id: Option<Value>, code: i32, message: &str) -> Self {
        Self {
            jsonrpc: "2.0".to_string(),
            id,
            result: None,
            error: Some(RpcError {
                code,
                message: message.to_string(),
                data: None,
            }),
        }
    }

    pub fn method_not_found(id: Option<Value>) -> Self {
        Self::error(id, -32601, "Method not found")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn request_deserializes_from_jsonrpc2_health() {
        let raw = r#"{"jsonrpc":"2.0","id":1,"method":"health","params":{}}"#;
        let req: Request = serde_json::from_str(raw).unwrap();
        assert_eq!(req.jsonrpc, "2.0");
        assert_eq!(req.method, "health");
        assert_eq!(req.id, Some(json!(1)));
    }

    #[test]
    fn health_result_serializes_to_expected_shape() {
        let hr = HealthResult {
            status: "ok".to_string(),
            backends: vec![],
            models: vec![],
        };
        let val: Value = serde_json::to_value(&hr).unwrap();
        assert_eq!(val["status"], "ok");
        assert!(val["backends"].as_array().unwrap().is_empty());
        assert!(val["models"].as_array().unwrap().is_empty());
    }

    #[test]
    fn response_success_wraps_result() {
        let hr = HealthResult {
            status: "ok".to_string(),
            backends: vec![],
            models: vec![],
        };
        let resp = Response::success(Some(json!(1)), hr);
        let val: Value = serde_json::to_value(&resp).unwrap();
        assert_eq!(val["jsonrpc"], "2.0");
        assert_eq!(val["id"], 1);
        assert_eq!(val["result"]["status"], "ok");
        assert!(val.get("error").is_none() || val["error"].is_null());
    }

    #[test]
    fn response_method_not_found_returns_minus_32601() {
        let resp = Response::method_not_found(Some(json!(2)));
        let val: Value = serde_json::to_value(&resp).unwrap();
        assert_eq!(val["error"]["code"], -32601);
        assert_eq!(val["error"]["message"], "Method not found");
        assert!(val.get("result").is_none() || val["result"].is_null());
    }
}
