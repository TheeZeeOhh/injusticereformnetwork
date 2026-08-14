# IRN OS — VPN (WireGuard, free + bring-your-own)

Free and open-source (WireGuard, in-kernel). **Configurable** = you supply the
config; there is no provider lock-in and nothing baked in. A fresh image ships
only the template and the `irn-vpn` helper — no VPN is connected until you add a
config, so it is off by default.

## Get a config

Any WireGuard `.conf` works:
- **Self-hosted** — `wg genkey`/`wg-quick` on a VPS; hand this device a peer config.
- **Proton VPN free tier** — export a WireGuard config from the dashboard (free).
- **Mullvad / IVPN / …** — download a WireGuard config.

OpenVPN configs are also supported (`network-manager-openvpn` is installed):
`nmcli connection import type openvpn file yourfile.ovpn`.

## Use it (`irn-vpn`)

```bash
sudo irn-vpn import ~/proton-free.conf   # → /etc/wireguard/irn.conf (chmod 600)
sudo irn-vpn up                          # connect now
irn-vpn status                           # show tunnel state
sudo irn-vpn autostart on                # connect at every boot
sudo irn-vpn down                        # disconnect
irn-vpn check                            # warn if not a leak-proof full tunnel
```

## Kill-switch (fail closed)

Keep `AllowedIPs = 0.0.0.0/0, ::/0` (full tunnel). wg-quick then drops any
traffic that would bypass the tunnel, so if the VPN drops, traffic stops rather
than leaking to the clear net. `irn-vpn check` and `irn-vpn up` warn if the
config narrows `AllowedIPs` (a split tunnel that leaks). Set `DNS =` in the
config so DNS goes through the tunnel too (openresolv is installed for this).

## Sealed-kiosk note

The sealed kiosk has no terminal. To use a VPN there, import the config and run
`irn-vpn autostart on` **before** building/sealing the image (or during the
Calamares install session), so the tunnel comes up automatically at boot. On the
desktop profile, run `irn-vpn` from a terminal as needed.

**Unverified:** never built or booted — validate on a VM with a throwaway peer.
