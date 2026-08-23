#!/usr/bin/env python3
"""IRN Store — a curated catalog of apps for IRN OS.

Deliberately NOT a general package manager. It shows a hand-picked list of
Debian-packaged software useful for IRN casework, plus the tools already built
into the image, and installs them through apt via a root helper that enforces the
catalog as an allowlist (see /usr/local/libexec/irn-store-install).

Design notes:
  * PyQt5, because Sanctuary Terminal and Zee Zee already pull it in — the store
    adds no new dependency to the image.
  * No icon-theme dependency: each app gets a generated letter tile, so the UI
    looks the same whether or not an icon theme is installed.
  * No network of its own. The only thing that touches the network is apt, when
    you press Install.
"""
import json
import os
import shutil
import subprocess
import sys

from PyQt5.QtCore import Qt, QThread, pyqtSignal
from PyQt5.QtGui import QColor, QFont, QPainter, QPixmap
from PyQt5.QtWidgets import (
    QApplication, QFrame, QHBoxLayout, QLabel, QLineEdit, QMainWindow,
    QMessageBox, QProgressBar, QPushButton, QScrollArea, QVBoxLayout, QWidget,
)

CATALOG = "/usr/local/share/irn-store/catalog.json"
HELPER = "/usr/local/libexec/irn-store-install"

BG = "#0b1a2b"
CARD = "#131a24"
EDGE = "#1f2a37"
TEXT = "#d7dee6"
MUTED = "#8a94a0"
ACCENT = "#7ab8ff"
GOOD = "#7ad38a"

TILE_COLOURS = ["#7ab8ff", "#b89b6e", "#7ad38a", "#c98bdb", "#e8905a", "#5fc9c3"]


def package_installed(package):
    """True if dpkg reports the package as properly installed."""
    if not package:
        return False
    try:
        out = subprocess.run(
            ["dpkg-query", "-W", "-f=${Status}", package],
            capture_output=True, text=True, timeout=10,
        ).stdout
    except (OSError, subprocess.SubprocessError):
        return False
    return "install ok installed" in out


def letter_tile(letter, colour):
    """Icon substitute: a rounded tile with the app's first letter."""
    pix = QPixmap(48, 48)
    pix.fill(QColor(0, 0, 0, 0))
    painter = QPainter(pix)
    painter.setRenderHint(QPainter.Antialiasing)
    painter.setBrush(QColor(colour))
    painter.setPen(Qt.NoPen)
    painter.drawRoundedRect(0, 0, 48, 48, 12, 12)
    painter.setPen(QColor("#0b1a2b"))
    font = QFont()
    font.setPointSize(20)
    font.setBold(True)
    painter.setFont(font)
    painter.drawText(pix.rect(), Qt.AlignCenter, letter.upper())
    painter.end()
    return pix


class PackageWorker(QThread):
    """Runs one apt action through pkexec so the GUI never holds root."""

    done = pyqtSignal(bool, str)

    def __init__(self, action, package):
        super().__init__()
        self.action = action
        self.package = package

    def run(self):
        try:
            proc = subprocess.run(
                ["pkexec", HELPER, self.action, self.package],
                capture_output=True, text=True,
            )
        except OSError as exc:
            self.done.emit(False, f"could not start pkexec: {exc}")
            return

        if proc.returncode == 0:
            self.done.emit(True, "")
        elif proc.returncode == 126:
            # pkexec's own code for "the user dismissed or failed the prompt".
            self.done.emit(False, "cancelled")
        else:
            message = (proc.stderr or proc.stdout or "").strip().splitlines()
            self.done.emit(False, message[-1] if message else f"exit {proc.returncode}")


class AppCard(QFrame):
    def __init__(self, app, colour, parent=None):
        super().__init__(parent)
        self.app = app
        self.package = app.get("package")
        self.worker = None

        self.setObjectName("card")
        self.setStyleSheet(
            f"#card {{ background: {CARD}; border: 1px solid {EDGE};"
            f" border-radius: 12px; }}"
        )
        row = QHBoxLayout(self)
        row.setContentsMargins(14, 12, 14, 12)
        row.setSpacing(14)

        icon = QLabel()
        icon.setPixmap(letter_tile(app["name"][0], colour))
        icon.setFixedSize(48, 48)
        row.addWidget(icon)

        text = QVBoxLayout()
        text.setSpacing(2)
        name = QLabel(app["name"])
        name.setStyleSheet(f"color: {TEXT}; font-size: 15px; font-weight: 600;")
        summary = QLabel(app.get("summary", ""))
        summary.setStyleSheet(f"color: {MUTED}; font-size: 12px;")
        summary.setWordWrap(True)
        text.addWidget(name)
        text.addWidget(summary)
        row.addLayout(text, 1)

        self.status = QLabel()
        self.status.setStyleSheet(f"color: {GOOD}; font-size: 12px;")
        row.addWidget(self.status)

        self.button = QPushButton()
        self.button.setCursor(Qt.PointingHandCursor)
        self.button.setFixedWidth(96)
        self.button.clicked.connect(self.on_click)
        row.addWidget(self.button)

        self.progress = QProgressBar()
        self.progress.setRange(0, 0)
        self.progress.setFixedWidth(96)
        self.progress.setTextVisible(False)
        self.progress.hide()
        row.addWidget(self.progress)

        self.refresh()

    def present(self):
        """Is a built-in app actually here? Checked, not assumed — a staging step
        that did not run should show as missing rather than as a dead Open."""
        path = self.app.get("path")
        if path and os.path.exists(path):
            return True
        launch = self.app.get("launch")
        return bool(launch and shutil.which(launch))

    def refresh(self):
        if self.app.get("builtin"):
            # Never offer apt for these: `sanctuary` and the staged apps are not
            # in the Debian archive, so an Install button could only ever fail.
            if self.present():
                self.status.setText("built in")
                self.button.setText("Open")
                self.button.setEnabled(bool(self.app.get("launch")))
            else:
                self.status.setText("not installed")
                self.button.setText("Open")
                self.button.setEnabled(False)
        elif package_installed(self.package):
            self.status.setText("installed")
            self.button.setText("Remove")
            self.button.setEnabled(True)
        else:
            self.status.setText("")
            self.button.setText("Install")
            self.button.setEnabled(True)
        self.button.setStyleSheet(
            f"QPushButton {{ background: {EDGE}; color: {TEXT}; border: 1px solid {EDGE};"
            f" border-radius: 8px; padding: 7px 10px; }}"
            f"QPushButton:hover {{ border-color: {ACCENT}; color: #fff; }}"
            f"QPushButton:disabled {{ color: {MUTED}; }}"
        )

    def on_click(self):
        label = self.button.text()
        if label == "Open":
            subprocess.Popen(
                [self.app["launch"]],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                start_new_session=True,
            )
            return
        self.start("install" if label == "Install" else "remove")

    def start(self, action):
        self.button.hide()
        self.progress.show()
        self.worker = PackageWorker(action, self.package)
        self.worker.done.connect(self.finished)
        self.worker.start()

    def finished(self, ok, message):
        self.progress.hide()
        self.button.show()
        self.refresh()
        if not ok and message != "cancelled":
            QMessageBox.warning(
                self, "IRN Store",
                f"Could not complete that for {self.package}.\n\n{message}\n\n"
                "If this says the archive is unreachable, the machine is offline — "
                "installing apps needs a network connection.",
            )


class Store(QMainWindow):
    def __init__(self, catalog):
        super().__init__()
        self.setWindowTitle("IRN Store")
        self.resize(860, 720)
        self.cards = []

        central = QWidget()
        central.setStyleSheet(f"background: {BG};")
        outer = QVBoxLayout(central)
        outer.setContentsMargins(22, 20, 22, 20)
        outer.setSpacing(14)

        title = QLabel("IRN STORE")
        title.setStyleSheet(
            f"color: {ACCENT}; font-size: 20px; font-weight: 600; letter-spacing: 3px;"
        )
        subtitle = QLabel(
            "Curated apps from the Debian archive. No third-party sources, no telemetry."
        )
        subtitle.setStyleSheet(f"color: {MUTED}; font-size: 12px;")
        outer.addWidget(title)
        outer.addWidget(subtitle)

        self.search = QLineEdit()
        self.search.setPlaceholderText("Search apps…")
        self.search.setStyleSheet(
            f"QLineEdit {{ background: {CARD}; color: {TEXT}; border: 1px solid {EDGE};"
            f" border-radius: 10px; padding: 9px 12px; font-size: 13px; }}"
            f"QLineEdit:focus {{ border-color: {ACCENT}; }}"
        )
        self.search.textChanged.connect(self.filter_cards)
        outer.addWidget(self.search)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        body = QWidget()
        body.setStyleSheet(f"background: {BG};")
        self.body_layout = QVBoxLayout(body)
        self.body_layout.setSpacing(10)
        self.body_layout.setContentsMargins(0, 0, 8, 0)

        colour_index = 0
        for category in catalog.get("categories", []):
            header = QLabel(category["name"].upper())
            header.setStyleSheet(
                f"color: {MUTED}; font-size: 11px; font-weight: 600;"
                f" letter-spacing: 2px; margin-top: 10px;"
            )
            self.body_layout.addWidget(header)
            self.headers = getattr(self, "headers", [])
            self.headers.append((header, []))

            if category.get("note"):
                note = QLabel(category["note"])
                note.setStyleSheet(f"color: {MUTED}; font-size: 11px;")
                note.setWordWrap(True)
                self.body_layout.addWidget(note)
                self.headers[-1] = (header, [], note)

            for app in category["apps"]:
                card = AppCard(app, TILE_COLOURS[colour_index % len(TILE_COLOURS)])
                colour_index += 1
                self.body_layout.addWidget(card)
                self.cards.append(card)

        self.body_layout.addStretch(1)
        scroll.setWidget(body)
        outer.addWidget(scroll, 1)

        self.setCentralWidget(central)

    def filter_cards(self, needle):
        needle = needle.strip().lower()
        for card in self.cards:
            haystack = f"{card.app['name']} {card.app.get('summary', '')}".lower()
            card.setVisible(needle in haystack)


def main():
    try:
        with open(CATALOG, encoding="utf-8") as fh:
            catalog = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"IRN Store: cannot read catalog {CATALOG}: {exc}", file=sys.stderr)
        return 1

    app = QApplication(sys.argv)
    app.setApplicationName("IRN Store")
    window = Store(catalog)
    window.show()
    return app.exec_()


if __name__ == "__main__":
    sys.exit(main())
