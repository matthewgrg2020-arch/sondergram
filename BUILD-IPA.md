# Build Sondergram as an IPA

Apple only lets a Mac with Xcode sign an .ipa. This zip is the iPhone/iPad app project.

## On a Mac

1. Install Xcode from the App Store and open it once.
2. Unzip this folder.
3. Double-click `ios/App/App.xcodeproj`.
4. At the top, choose your iPhone or "Any iOS Device".
5. Click the Sondergram target → Signing & Capabilities.
6. Check **Automatically manage signing** and pick your Apple ID team.
7. Menu: **Product → Archive**.
8. In the Organizer, click **Distribute App** → **Ad Hoc** or **Development** → Export.
9. That export is `Sondergram.ipa`. AirDrop it or use Finder to install on a paired iPhone.

A free Apple ID can install on your own phone for 7 days. A paid Apple Developer account ($99/year) keeps it signed longer and can use TestFlight.

## From the terminal (Mac)

```bash
npm install
npm run build:apk
npx cap sync ios
cd ios/App
xcodebuild -scheme App -configuration Release -archivePath build/Sondergram.xcarchive archive
xcodebuild -exportArchive -archivePath build/Sondergram.xcarchive -exportPath build/ipa -exportOptionsPlist ExportOptions.plist
```
