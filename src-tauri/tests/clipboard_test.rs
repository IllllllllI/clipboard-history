// Test to check what's in the clipboard
use arboard::Clipboard;

fn main() {
    println!("=== Clipboard Content Test ===\n");
    
    let mut clipboard = match Clipboard::new() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Failed to open clipboard: {}", e);
            return;
        }
    };
    
    // Try to get text
    println!("1. Trying to get text...");
    match clipboard.get_text() {
        Ok(text) => {
            println!("   ✓ Text available ({} chars)", text.len());
            println!("   First 100 chars: {:?}", text.chars().take(100).collect::<String>());
        }
        Err(e) => {
            println!("   ✗ No text: {}", e);
        }
    }
    
    // Try to get image
    println!("\n2. Trying to get image...");
    match clipboard.get_image() {
        Ok(image_data) => {
            println!("   ✓ Image available!");
            println!("   Size: {}x{}", image_data.width, image_data.height);
            println!("   Bytes: {} ({} KB)", 
                     image_data.bytes.len(), 
                     image_data.bytes.len() / 1024);
        }
        Err(e) => {
            println!("   ✗ No image: {}", e);
        }
    }
    
    println!("\n=== Test Complete ===");
    println!("\nNote: If both text AND image are available,");
    println!("it means your clipboard has multiple formats.");
    println!("This is common when copying from web browsers.");
}
