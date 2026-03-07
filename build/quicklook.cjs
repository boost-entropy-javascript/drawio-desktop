// Sets up the macOS Quick Look preview extension for .drawio files.
// Called from afterPack (via fuses.cjs) during electron-builder packaging.
//
// This copies the quicklookjs PreviewExtension.appex into the app bundle,
// replaces the default preview.html with our draw.io viewer, bundles
// viewer-static.min.js, and writes a custom Info.plist declaring the
// com.jgraph.drawio UTI.
//
// The .appex is NOT signed here. Signing happens in notarize.mjs (afterSign)
// where we re-sign the .appex with sandbox entitlements and then re-sign
// the outer .app before notarization.

const path = require('path');
const fs = require('fs');

const APPEX_BUNDLE_ID = 'com.jgraph.drawio.desktop.PreviewExtension';
const DRAWIO_UTI = 'com.jgraph.drawio';

async function setupQuickLook(context)
{
	const { appOutDir, electronPlatformName } = context;

	if (electronPlatformName !== 'darwin')
	{
		return;
	}

	const appName = context.packager.appInfo.productFilename;
	const appVersion = context.packager.appInfo.version;
	const appPath = path.join(appOutDir, `${appName}.app`);
	const plugInsDir = path.join(appPath, 'Contents', 'PlugIns');
	const appexDest = path.join(plugInsDir, 'PreviewExtension.appex');
	const appexResourcesDir = path.join(appexDest, 'Contents', 'Resources');

	const projectDir = path.resolve(__dirname, '..');
	const appexSrc = path.join(projectDir, 'node_modules', 'quicklookjs',
		'dist', 'PreviewExtension.appex');

	// Find viewer-static.min.js (CI copies to build/, local dev uses submodule)
	const viewerCandidates = [
		path.join(projectDir, 'build', 'viewer-static.min.js'),
		path.join(projectDir, 'drawio', 'src', 'main', 'webapp', 'js', 'viewer-static.min.js'),
	];

	let viewerSrc = null;

	for (const p of viewerCandidates)
	{
		if (fs.existsSync(p))
		{
			viewerSrc = p;
			break;
		}
	}

	if (!viewerSrc)
	{
		console.warn('Quick Look: viewer-static.min.js not found, skipping Quick Look setup');
		console.warn('Quick Look: expected at one of:', viewerCandidates.join(', '));
		return;
	}

	if (!fs.existsSync(appexSrc))
	{
		console.warn('Quick Look: quicklookjs .appex not found at', appexSrc);
		return;
	}

	console.log('Quick Look: setting up preview extension...');
	console.log('Quick Look: using viewer from', viewerSrc);

	// Copy .appex bundle
	fs.mkdirSync(plugInsDir, { recursive: true });
	fs.cpSync(appexSrc, appexDest, { recursive: true });

	// Copy our preview.html
	fs.copyFileSync(
		path.join(__dirname, 'quicklook-preview.html'),
		path.join(appexResourcesDir, 'preview.html')
	);

	// Copy viewer-static.min.js
	fs.copyFileSync(viewerSrc, path.join(appexResourcesDir, 'viewer-static.min.js'));

	// Write custom Info.plist
	const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleDevelopmentRegion</key>
	<string>en</string>
	<key>CFBundleDisplayName</key>
	<string>draw.io Quick Look</string>
	<key>CFBundleExecutable</key>
	<string>PreviewExtension</string>
	<key>CFBundleIdentifier</key>
	<string>${APPEX_BUNDLE_ID}</string>
	<key>CFBundleInfoDictionaryVersion</key>
	<string>6.0</string>
	<key>CFBundleName</key>
	<string>PreviewExtension</string>
	<key>CFBundlePackageType</key>
	<string>XPC!</string>
	<key>CFBundleShortVersionString</key>
	<string>${appVersion}</string>
	<key>CFBundleSupportedPlatforms</key>
	<array>
		<string>MacOSX</string>
	</array>
	<key>CFBundleVersion</key>
	<string>1</string>
	<key>LSMinimumSystemVersion</key>
	<string>11.0</string>
	<key>NSExtension</key>
	<dict>
		<key>NSExtensionAttributes</key>
		<dict>
			<key>QLSupportedContentTypes</key>
			<array>
				<string>${DRAWIO_UTI}</string>
			</array>
			<key>QLSupportsSearchableItems</key>
			<false/>
		</dict>
		<key>NSExtensionPointIdentifier</key>
		<string>com.apple.quicklook.preview</string>
		<key>NSExtensionPrincipalClass</key>
		<string>PreviewExtension.PreviewViewController</string>
	</dict>
	<key>QLJS</key>
	<dict>
		<key>loadingStrategy</key>
		<string>waitForSignal</string>
		<key>pagePath</key>
		<string>preview.html</string>
		<key>preferredContentSize</key>
		<string>{800,600}</string>
		<key>transparentBackground</key>
		<false/>
	</dict>
</dict>
</plist>`;

	fs.writeFileSync(path.join(appexDest, 'Contents', 'Info.plist'), infoPlist);

	// Remove the old code signature (it's invalid after our modifications).
	// The .appex will be properly signed in notarize.mjs (afterSign) with
	// the correct sandbox entitlements before notarization.
	const codeSignDir = path.join(appexDest, 'Contents', '_CodeSignature');

	if (fs.existsSync(codeSignDir))
	{
		fs.rmSync(codeSignDir, { recursive: true });
	}

	console.log('Quick Look: setup complete (signing deferred to afterSign)');
}

module.exports = { setupQuickLook };
