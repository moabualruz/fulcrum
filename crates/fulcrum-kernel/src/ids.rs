#[derive(Debug, Default)]
pub struct IdGenerator {
    next: u64,
}

impl IdGenerator {
    pub fn next(&mut self, prefix: &str) -> String {
        self.next += 1;
        format!("{prefix}_{:06}", self.next)
    }
}
