# Verified local toolchain

- Node22.22.3, pnpm11.25.0; web dependency versions pinned in package manifest/lockfile. Installation used --ignore-scripts, no persistent global build-script grant.
- Next15.5.29/React19.3.1/TypeScript5.9.3; native NextSWCDLL fails initialization on this host, officialNextWASM fallback works. Production build completed successfully; preserve warning rather than claim a zero-warning native build.
- Foundry1.9.0 Windowsamd64 ZIP from official release v1.9.0; SHA256 **2b02444d46c9218fe2e6be66015265ce131fe6b7c384e33e630b00f9a0bff072** matched official published asset digest before execution. Forge/Anvil commit6056c5845d34205a83cf7108042adb137325c9df. Executables under project .tools/foundry, never globalPATH.
- Solidity0.8.24, EVMParis, optimizer200; remappings in Foundry config.
- OpenZeppelin officialsource tagv5.0.2 archive SHA256 **ca49e0776066328da0087977864dfaef0d5e54a0ea9859236a7cd9ad02abb9e5**.
- forge-std officialsource tagv1.9.7 archive SHA256 **6437626a67008dca2e06e3783a37c65772c145df2da901943a894b9c0b770531**.
- Selfhosted BeVietnamPro5.3.0 serves Latin/Vietnamese text without runtimefontnetworkrequests, packagedOFLlicense retained in dependency.
- Browser tests use installed MicrosoftEdge with fresh isolated contexts and Playwright1.65.1; no browsersecurityflags or realuserprofile. BrowserSkilldaemonwasreachablebutnoextensionconnected; diagnosedwithoutsettingschanges. It laterexitednormallyidle.

No deployerkey, userwalletauthorization, Fuji broadcast, globaltoolinstallation, Gitoperation or publichosting occurred during setup.
