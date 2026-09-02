import sys
from PyQt5.QtWidgets import QApplication, QMessageBox
app = QApplication(sys.argv)
QMessageBox.information(None, "Test", "Hello from Tauri backend")
