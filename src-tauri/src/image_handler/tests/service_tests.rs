use super::*;
use std::sync::Arc;
use std::thread;

#[test]
fn service_set_and_get_profile_roundtrip() {
    let service = ImageServiceState::new().expect("service init failed");

    service.set_performance_profile("quality").expect("set quality should succeed");
    let quality = service.get_performance_profile().expect("get profile should succeed");
    assert_eq!(quality, "quality");

    service.set_performance_profile("balanced").expect("set balanced should succeed");
    let balanced = service.get_performance_profile().expect("get profile should succeed");
    assert_eq!(balanced, "balanced");

    service.set_performance_profile("speed").expect("set speed should succeed");
    let speed = service.get_performance_profile().expect("get profile should succeed");
    assert_eq!(speed, "speed");

    service.set_performance_profile("balanced").expect("restore default profile should succeed");
}

#[test]
fn service_rejects_invalid_profile() {
    let service = ImageServiceState::new().expect("service init failed");

    let result = service.set_performance_profile("unknown-profile");
    assert!(matches!(result, Err(ImageError::InvalidFormat(_))));
}

#[test]
fn service_profile_concurrent_access_stress() {
    let service = Arc::new(ImageServiceState::new().expect("service init failed"));

    let workers = 8;
    let iterations = 200;

    let mut handles = Vec::with_capacity(workers);
    for worker_id in 0..workers {
        let service = Arc::clone(&service);
        handles.push(thread::spawn(move || {
            let profiles = ["quality", "balanced", "speed"];

            for i in 0..iterations {
                let profile = profiles[(worker_id + i) % profiles.len()];
                service.set_performance_profile(profile).expect("set profile should succeed");

                let current = service.get_performance_profile().expect("get profile should succeed");
                assert!(matches!(current.as_str(), "quality" | "balanced" | "speed"));
            }
        }));
    }

    for handle in handles {
        handle.join().expect("worker thread should not panic");
    }

    service.set_performance_profile("balanced").expect("restore default profile should succeed");
}

#[test]
fn service_profile_concurrent_mixed_invalid_inputs() {
    let service = Arc::new(ImageServiceState::new().expect("service init failed"));

    let workers = 10;
    let iterations = 120;

    let mut handles = Vec::with_capacity(workers);
    for worker_id in 0..workers {
        let service = Arc::clone(&service);
        handles.push(thread::spawn(move || {
            let valid_profiles = ["quality", "balanced", "speed"];
            let invalid_profiles = ["", "ultra", "fastest", "balance-d"];

            for i in 0..iterations {
                if (worker_id + i) % 3 == 0 {
                    let invalid = invalid_profiles[(worker_id + i) % invalid_profiles.len()];
                    let result = service.set_performance_profile(invalid);
                    assert!(matches!(result, Err(ImageError::InvalidFormat(_))));
                } else {
                    let valid = valid_profiles[(worker_id + i) % valid_profiles.len()];
                    service.set_performance_profile(valid).expect("set valid profile should succeed");
                }

                let current = service.get_performance_profile().expect("get profile should succeed");
                assert!(matches!(current.as_str(), "quality" | "balanced" | "speed"));
            }
        }));
    }

    for handle in handles {
        handle.join().expect("worker thread should not panic");
    }

    service.set_performance_profile("balanced").expect("restore default profile should succeed");
}

#[test]
#[ignore = "long-running soak test"]
fn service_profile_long_running_soak() {
    let service = Arc::new(ImageServiceState::new().expect("service init failed"));

    let workers = 12;
    let iterations = 10_000;

    let mut handles = Vec::with_capacity(workers);
    for worker_id in 0..workers {
        let service = Arc::clone(&service);
        handles.push(thread::spawn(move || {
            let profiles = ["quality", "balanced", "speed"];

            for i in 0..iterations {
                let profile = profiles[(worker_id + i) % profiles.len()];
                service.set_performance_profile(profile).expect("set profile should succeed");

                let current = service.get_performance_profile().expect("get profile should succeed");
                assert!(matches!(current.as_str(), "quality" | "balanced" | "speed"));
            }
        }));
    }

    for handle in handles {
        handle.join().expect("worker thread should not panic");
    }

    service.set_performance_profile("balanced").expect("restore default profile should succeed");
}
