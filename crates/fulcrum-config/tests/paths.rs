use fulcrum_config::FulcrumPaths;
use std::fs;

#[test]
fn ensure_creates_local_layout_and_default_config() {
    let root = std::env::temp_dir().join(format!("fulcrum-config-test-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    let paths = FulcrumPaths::from_home(&root);

    paths.ensure().unwrap();

    assert!(paths.config.exists());
    assert!(paths.logs.exists());
    assert!(paths.backups.exists());
    assert!(
        fs::read_to_string(&paths.config)
            .unwrap()
            .contains("profile = \"core\"")
    );

    let _ = fs::remove_dir_all(&root);
}
