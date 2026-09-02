with open("/home/aziza/Desktop/code/zee_tools.py", "r") as f:
    text = f.read()

import re

# Everything between `return tools` and `def parse_action` needs to be dedented by 4 spaces.
parts = re.split(r'(return tools\n)', text)
if len(parts) == 3:
    pre = parts[0]
    ret = parts[1]
    post = parts[2]
    
    post_parts = re.split(r'(\ndef parse_action)', post)
    if len(post_parts) == 3:
        injected = post_parts[0]
        rest = post_parts[1] + post_parts[2]
        
        # dedent injected
        lines = injected.split('\n')
        dedented_lines = []
        for line in lines:
            if line.startswith("    "):
                dedented_lines.append(line[4:])
            else:
                dedented_lines.append(line)
                
        new_text = pre + ret + "\n".join(dedented_lines) + rest
        
        with open("/home/aziza/Desktop/code/zee_tools.py", "w") as f:
            f.write(new_text)
