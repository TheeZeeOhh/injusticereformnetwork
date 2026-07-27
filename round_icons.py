import os
from PIL import Image, ImageDraw

icons_dir = "/home/aziza/injusticereformnetwork/src-tauri/icons"

for filename in os.listdir(icons_dir):
    if not filename.endswith(".png"):
        continue
        
    filepath = os.path.join(icons_dir, filename)
    try:
        img = Image.open(filepath).convert("RGBA")
    except Exception as e:
        print(f"Failed to open {filename}: {e}")
        continue
        
    width, height = img.size
    
    # Don't try to round tiny things that are already small if they don't have enough pixels, 
    # but math handles it (radius will be small).
    radius = int(width * 0.20) 
    
    # Create a completely transparent mask
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    
    # Draw a solid white rounded rectangle
    draw.rounded_rectangle([(0, 0), (width, height)], radius, fill=255)
    
    # Apply mask
    rounded_img = Image.new("RGBA", (width, height))
    rounded_img.paste(img, (0, 0), mask=mask)
    
    # Save back to same file
    rounded_img.save(filepath, "PNG")
    print(f"Rounded {filename} (size: {width}x{height}, radius: {radius})")
