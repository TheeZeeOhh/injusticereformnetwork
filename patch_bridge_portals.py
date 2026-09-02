with open("/home/aziza/Desktop/code/ai_twin_app/src-tauri/resources/zee_bridge.py", "r") as f:
    text = f.read()

portal_logic = """
def m_run_portal(req, params):
    portal_id = params.get("id")
    args = params.get("args", {})
    import zee_portals
    # Map portal_id to functions in zee_portals
    mapping = {
        "cirn_pitch": ("generate_cirn_pitch", ["target_key", "initiative", "requested_amt"]),
        "invoice": ("generate_invoice", ["client_name", "service_desc", "amount"]),
        "harm_receipt": ("generate_harm_receipt", ["agency_name", "policy_desc"]),
        "foia": ("foia_draft", []), # Need args?
        "grant_proposal": ("generate_grant_proposal", []), # Wait, is this in zee_portals?
    }
    # Actually, it's easier to just pass the prompt to the LLM via Operator mode!
    return True
"""
