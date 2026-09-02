with open("/home/aziza/Desktop/code/zee_tools.py", "r") as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    if 1124 <= i <= 1222:
        if line.startswith("    "):
            new_lines.append(line[4:])
        else:
            new_lines.append(line)
    else:
        new_lines.append(line)

with open("/home/aziza/Desktop/code/zee_tools.py", "w") as f:
    f.writelines(new_lines)
