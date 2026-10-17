"""test_capital_matrix.py — verification suite for the IRN Capital Matrix application."""
import os
import re
import unittest


class TestCapitalMatrix(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html_path = "/home/aziza/injusticereformnetwork/capital_matrix.html"
        with open(cls.html_path, "r", encoding="utf-8") as f:
            cls.content = f.read()

    def test_file_exists(self):
        self.assertTrue(os.path.exists(self.html_path))
        self.assertGreater(len(self.content), 5000)

    def test_golden_communication_rule_mandatory_cc(self):
        """Must explicitly note CC: cirnpresident@gmail.com (BeKura Smith) and Aziza sender."""
        self.assertIn("cirnpresident@gmail.com", self.content)
        self.assertIn("BeKura Smith", self.content)
        self.assertIn("Aziza", self.content)
        self.assertIn("Strategic Partnerships", self.content)

    def test_all_seven_funder_profiles_present(self):
        """All 7 CIRN institutional target profiles must be integrated."""
        targets = [
            "MacArthur Foundation",
            "Arnold Ventures",
            "Ford Foundation",
            "The Criminal Justice Initiative",
            "Andrus Family Fund & Akonadi Foundation",
            "Bureau of Justice Assistance",
            "REFORM Alliance"
        ]
        for target in targets:
            self.assertIn(target, self.content, f"Missing target profile: {target}")

    def test_operation_glass_house_audit_monetization(self):
        """Must contain forensic audit fee estimator, SOW, and disparate impact metrics."""
        self.assertIn("OPERATION GLASS HOUSE", self.content)
        self.assertIn("Proxy Variable", self.content)
        self.assertIn("Disparate Impact", self.content)
        self.assertIn("Expert Witness", self.content)
        self.assertIn("Retainer", self.content)

    def test_irn_design_system_tokens(self):
        """Must adhere to IRN Design System color tokens and fonts."""
        tokens = [
            "#0a0a0a",  # --black
            "#f5f0eb",  # --white
            "#c9a84c",  # --gold
            "#4a1f6e",  # --purple
            "#c2547a",  # --rose
            "DM Serif Display",
            "Inter"
        ]
        for token in tokens:
            self.assertIn(token, self.content, f"Missing design token: {token}")

    def test_no_charity_pity_narrative(self):
        """Language must be protective infrastructure / economic corrections, not charity."""
        self.assertIn("economic", self.content.lower())
        self.assertIn("sovereignty", self.content.lower())
        self.assertNotIn("we beg for donations", self.content.lower())
        self.assertNotIn("pity the poor", self.content.lower())

    def test_dom_injection_safety(self):
        """DOM operations must be wrapped in DOMContentLoaded."""
        self.assertIn("DOMContentLoaded", self.content)

    def test_https_integrity(self):
        """No insecure http:// assets in external links or imports."""
        # Find external script/link tags
        matches = re.findall(r'(src|href)=["\'](http://[^"\']+)["\']', self.content)
        # Only 127.0.0.1 / localhost local API is allowed for http
        for attr, url in matches:
            self.assertTrue(
                "127.0.0.1" in url or "localhost" in url,
                f"Insecure mixed-content external HTTP asset detected: {url}"
            )


if __name__ == "__main__":
    unittest.main()
