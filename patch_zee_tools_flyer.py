with open("/home/aziza/Desktop/code/zee_tools.py", "r") as f:
    text = f.read()

flyer_tool = """
    def design_flyer(title, subtitle="", content_points=[], call_to_action="", theme_color="#4a1f6e", output_filename="flyer"):
        \"\"\"Design and render a beautiful PDF poster/flyer.
        content_points should be a list of strings (e.g. details, date, time).
        \"\"\"
        import os
        import subprocess
        
        # Build HTML
        points_html = "".join([f"<li style='margin-bottom: 12px;'>{p}</li>" for p in content_points])
        
        html_content = f\"\"\"
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&display=swap');
                body {{
                    font-family: 'Montserrat', sans-serif;
                    margin: 0; padding: 0;
                    background-color: #f5f0eb;
                    color: #1e1e24;
                    width: 8.5in; height: 11in;
                    box-sizing: border-box;
                    display: flex; flex-direction: column;
                    border: 12px solid {theme_color};
                }}
                .header {{
                    background: {theme_color};
                    color: #fff;
                    padding: 60px 40px;
                    text-align: center;
                }}
                .header h1 {{
                    font-size: 56px;
                    font-weight: 900;
                    margin: 0;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                }}
                .header h2 {{
                    font-size: 28px;
                    font-weight: 400;
                    margin: 15px 0 0 0;
                    color: rgba(255, 255, 255, 0.9);
                }}
                .content {{
                    padding: 50px 60px;
                    flex-grow: 1;
                    font-size: 24px;
                    line-height: 1.6;
                }}
                ul {{
                    list-style-type: square;
                    padding-left: 20px;
                }}
                .cta {{
                    background: #1e1e24;
                    color: {theme_color};
                    padding: 40px;
                    text-align: center;
                    font-size: 32px;
                    font-weight: 700;
                    text-transform: uppercase;
                }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>{title}</h1>
                <h2>{subtitle}</h2>
            </div>
            <div class="content">
                <ul>
                    {points_html}
                </ul>
            </div>
            <div class="cta">
                {call_to_action}
            </div>
        </body>
        </html>
        \"\"\"
        
        base_path = os.path.join(_safe_path(root, "Desktop"), output_filename.replace(".pdf", "").replace(".html", ""))
        html_path = base_path + ".html"
        pdf_path = base_path + ".pdf"
        
        with open(html_path, "w") as f:
            f.write(html_content)
            
        try:
            subprocess.run(["chromium", "--headless", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={pdf_path}", html_path], check=True, capture_output=True)
            return f"Success! PDF Flyer generated at {pdf_path}"
        except Exception as e:
            return f"Created HTML at {html_path}, but PDF conversion failed: {e}"
"""

# Inject before parsing loop
text = text.replace("    def make_phone_call", flyer_tool + "\n    def make_phone_call")

# Register in default_tools
register = """        "design_flyer":              {"fn": design_flyer,              "dangerous": False, "desc": "design and render a beautiful PDF flyer/poster: {title, subtitle (optional), content_points (list of strings), call_to_action, theme_color (hex), output_filename}"},"""
text = text.replace('        "make_phone_call":', register + '\n        "make_phone_call":')

with open("/home/aziza/Desktop/code/zee_tools.py", "w") as f:
    f.write(text)
