with open("src-tauri/src/lib.rs", "r") as f:
    lines = f.readlines()
with open("src-tauri/src/lib.rs", "w") as f:
    for line in lines:
        if line.strip() == "zee_bridge_request,":
            pass
        elif line.strip() == "hive_bridge_respond":
            f.write("            zee_bridge_request,\n            hive_bridge_respond\n")
        else:
            f.write(line)
