# Personal QR codec

Actual exports in `apps/web/src/infrastructure/qr/index.ts`:

- `encodeParticipantQr({potId:string,participant:Address}):string`
- `decodeParticipantQr(payload:string,{expectedPotId?:string}?):{v:1,potId:string,participant:Address}`
- `QrError` with stable `code='INVALID_QR'`.

Exactly three JSON keys `v`, `potId`, `participant`; v must1, canonicalpositiveuint256decimalID, nonzero40hexaddress normalizedlowercase. Payloadmax1024characters. Extra/prototypekeys, wrongversion/context, URLs, invalidIDs andaddresses reject. UI renders actualQRwithqrcode and offerscopyablepayload/manualinput. BarcodeDetectorcameraonlywhenavailableandpermissiongranted; cleanupstopsalltracks.

This identifies a wallet and pot under a configured network/core context. It is not cryptographic proof of ownership, physical presence, uniqueness or duration. Humanverifierchecksattendance; contractvalidatesseparatewalletspecificEIP712proof.
