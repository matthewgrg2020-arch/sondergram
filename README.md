# Sondergram

A local listening room: drop in MP3, FLAC, WAV, and similar files, then use the 31-band EQ, tags, radio, and library. Music stays on this device. Nothing is uploaded.

## Run it on your computer

1. Install [Node.js](https://nodejs.org/) 22 or newer.
2. Unzip this folder.
3. In a terminal, from the unzipped folder:

```bash
npm install
npm run dev
```

4. Open the URL it prints (usually `http://localhost:8080`).
5. Drop tracks in, or use **Add**.

## Android APK

Install **sondergram.apk** on your phone:

1. Copy the APK to the phone (Downloads is fine).
2. Open it. Android will ask you to allow installs from that app (Files, Chrome, Drive, etc.).
3. Open Sondergram and use **Add** to pick songs. Drag-and-drop is a desktop thing.

This is a debug build, so Play Protect may warn once. Allow it. Your library lives on the phone; it is not the same library as the website.

To rebuild after code changes:

```bash
npm run apk
```

That writes `artifacts/sondergram.apk`.

## iPhone IPA

A signed `.ipa` can only be built on a **Mac with Xcode** (Apple’s rule). This repo includes the iOS project.

1. Download **sondergram-ios.zip** from Settings, or run `npm run ipa`.
2. On a Mac, unzip and open `ios/App/App.xcodeproj`.
3. Signing & Capabilities → your Apple ID team.
4. **Product → Archive** → Distribute App → export `Sondergram.ipa`.
5. Install on your iPhone from that Mac (cable or Finder).

A free Apple ID lasts about 7 days per install. Paid Apple Developer is needed for TestFlight.

On iPhone Safari you can also **Share → Add to Home Screen**.

## Host it online

The production web build is set up for **Vercel**. Your library does not travel with the site; each device has its own collection.
