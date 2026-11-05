`zxing_reader.wasm` is the reader-only WebAssembly binary from `zxing-wasm` 3.1.6,
which wraps ZXing-C++. It is served by this application so decoding QR images
does not rely on a third-party CDN. SHA-256:
`5003fb4b88c4fbd1fd518a2fd8c8ad365c519e183a08c03a322dddfea3cea84e`.

The wrapper uses the MIT license; ZXing-C++ uses Apache-2.0. Their license texts
are included in this directory. The reader version is pinned in `package-lock.json`.
