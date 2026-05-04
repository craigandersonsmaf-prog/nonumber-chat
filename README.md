# NoNumber Live Chat Hotfix

This is a simplified hotfix build.

What changed:
- Service worker removed
- Old caches are cleared on load
- Buttons use one global click handler
- Creator Admin can create groups directly
- Chat messages are live through Firebase Firestore
- Firebase config is already filled for the NoNumber Chat project

Upload all files to the GitHub repo root and commit changes.

After upload:
1. Open https://craigandersonsmaf-prog.github.io/nonumber-chat/?v=hotfix2
2. Click Creator Admin
3. PIN: 0000
4. Create a group
5. Send a message
6. Open the same link on another device and check the message appears
