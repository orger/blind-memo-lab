import AppKit
@preconcurrency import WebKit

/// Exercises real WebKit and the native file bridge with disposable data.
@main
struct BlindNativeSmoke {
    static var delegate: AppDelegate!
    static var phase = 0
    static var store: URL!
    static var attemptID = ""
    static var vaultFixture: [String: Any] = [:]

    static func main() throws {
        let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
        let fixtureSource = try String(contentsOf: root.appendingPathComponent("tests/blind-native-vault-fixture.js"), encoding: .utf8)
        let fixtureJSON = fixtureSource.replacingOccurrences(of: "export const TEST_VAULT = ", with: "")
            .trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(CharacterSet(charactersIn: ";")))
        guard let fixture = try JSONSerialization.jsonObject(with: Data(fixtureJSON.utf8)) as? [String: Any] else { fail("Generic encrypted fixture missing.") }
        vaultFixture = fixture
        let output = root.appendingPathComponent(".build/blind-native-qa-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
        store = output.appendingPathComponent("data.json")
        delegate = AppDelegate(resourceRoot: root.appendingPathComponent("app/blind", isDirectory: true), storeURL: store, onLoad: run)
        NSApplication.shared.delegate = delegate
        DispatchQueue.main.asyncAfter(deadline: .now() + 45) { fail("Blind Memo Lab native check timed out.") }
        NSApplication.shared.run()
    }

    static func fail(_ message: String) -> Never {
        fputs("FAIL: \(message)\n", stderr)
        exit(1)
    }

    static func run(_ webView: WKWebView) {
        webView.callAsyncJavaScript(phase == 0 ? firstPass : secondPass, arguments: ["expectedAttemptID": attemptID, "testVault": vaultFixture], in: nil, in: .page) { result in
            switch result {
            case .failure(let error):
                fail((error as NSError).userInfo["WKJavaScriptExceptionMessage"] as? String ?? error.localizedDescription)
            case .success(let value):
                if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), let json = String(data: data, encoding: .utf8) { print(json) }
                if phase == 0 {
                    guard let details = value as? [String: Any], let id = details["attemptID"] as? String else { fail("Native check did not return an attempt ID.") }
                    attemptID = id
                    phase = 1
                    webView.reload()
                } else {
                    guard FileManager.default.fileExists(atPath: store.path),
                          FileManager.default.fileExists(atPath: store.deletingLastPathComponent().appendingPathComponent("data.previous.json").path) else { fail("Durable data or previous-file backup missing.") }
                    print("PASS: Blind Memo Lab native authenticated decryption, timed recall, durable save, backup, reload, hidden memo prompts, and orientation answers. Fixture: \(store.path)")
                    exit(0)
                }
            }
        }
    }

    static let ready = #"""
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const assert = (condition, message) => { if (!condition) throw new Error(message); };
    for (let i = 0; i < 180 && document.body.dataset.ready !== 'true'; i++) await wait(50);
    assert(document.body.dataset.ready === 'true', 'Blind Memo Lab failed to initialize: ' + document.body.innerText);
    assert(typeof window.blindMemoQA === 'function', 'Native verification snapshot missing');
    assert(window.cornerlabNative, 'Native bridge missing');
    """#

    static var firstPass: String { ready + #"""
    const info = await window.cornerlabNative.info();
    assert(info.dataPath.includes('blind-native-qa-'), 'Check must not use production data');
    assert(info.version === '1.0.1', 'Standalone native identity missing');
    assert(typeof window.cornerlabNative.decryptMemoDefaults === 'function', 'Native default-memo decryption bridge missing');
    const decrypted = await window.cornerlabNative.decryptMemoDefaults(testVault, 'native-test-passphrase');
    assert(decrypted.format === 'blind-memo-defaults' && decrypted.version === 1 && decrypted.memos['pair:AB'] === 'Native test fixture', 'Native decryption is incompatible with the browser vault format');
    async function mustReject(vault, password) {
      let rejected = false;
      try { await window.cornerlabNative.decryptMemoDefaults(vault, password); } catch { rejected = true; }
      assert(rejected, 'Invalid password or encrypted data was accepted');
    }
    await mustReject(testVault, 'incorrect-test-password');
    const tampered = {...testVault, ciphertext:(testVault.ciphertext[0] === 'A' ? 'B' : 'A') + testVault.ciphertext.slice(1)};
    await mustReject(tampered, 'native-test-passphrase');
    for (const invalid of [{...testVault,version:true},{...testVault,iterations:99_999},{...testVault,iv:'AA=='},{...testVault,salt:'AA=='}]) await mustReject(invalid, 'native-test-passphrase');
    // Metadata can be used with a private custom memo while defaults stay locked.
    document.querySelector('[data-page="library"]').click();
    const search = document.querySelector('#library-search');
    search.value = 'AB'; search.dispatchEvent(new Event('input', {bubbles:true}));
    document.querySelector('[data-action="edit-memo"][data-id="pair:AB"]').click();
    document.querySelector('#memo-edit').value = 'Native test fixture';
    document.querySelector('[data-action="save-memo"]').click();
    document.querySelector('[data-page="recall"]').click();
    for (let i = 0; i < 100 && document.visibilityState !== 'visible'; i++) await wait(50);
    assert(document.visibilityState === 'visible', 'Native window is not visible for timed recall');
    assert(document.querySelector('#recall-start'), 'Start recall control missing');
    document.querySelector('#recall-start').click();
    await wait(160);
    const diagnostic = () => JSON.stringify({phase:window.blindMemoQA().phase,visibility:document.visibilityState,notice:document.querySelector('#notice')?.textContent,body:document.body.innerText.slice(-700)});
    assert(window.blindMemoQA().phase === 'question', 'Timed question did not start: ' + diagnostic());
    assert(document.querySelector('#recall-reveal'), 'Reveal control missing');
    document.body.dispatchEvent(new KeyboardEvent('keydown', {key:' ',code:'Space',bubbles:true}));
    await wait(40);
    assert(document.querySelector('[data-rating="good"]'), 'Reaction did not reveal ratings: ' + diagnostic());
    document.querySelector('[data-rating="good"]').click();
    let saved;
    for (let i = 0; i < 100; i++) {
      saved = await window.cornerlabNative.load();
      if (saved?.history?.length === 1) break;
      await wait(50);
    }
    assert(saved?.history?.length === 1, 'Timed recall result was not persisted');
    const attempt = saved.history[0];
    assert(attempt.seconds > 0 && attempt.seconds < 10, 'Invalid reaction time');
    assert(attempt.rating === 'good', 'Rating was not persisted');
    assert(Object.keys(saved.records).length === 1, 'Per-card repetition record missing');
    await window.cornerlabNative.save(saved);
    return {phase:'before-reload', attemptID:attempt.id, seconds:attempt.seconds, nativeCrypto:true, webCryptoAvailable:Boolean(globalThis.crypto?.subtle), nativeMethods:Object.keys(window.cornerlabNative), dataPath:info.dataPath};
    """# }

    static var secondPass: String { ready + #"""
    const loaded = await window.cornerlabNative.load();
    assert(loaded.history.length === 1 && loaded.history[0].id === expectedAttemptID, 'Saved recall did not survive reload');
    assert(window.blindMemoQA().state.history.length === 1, 'UI did not restore saved recall');
    const library = document.querySelector('[data-page="library"]');
    assert(library, 'Memo library navigation missing');
    library.click();
    assert(document.querySelector('#library-search'), 'Memo library search missing');
    assert(document.querySelectorAll('.memo-item').length > 0, 'Memo library did not render');
    const libraryItems = document.querySelectorAll('.memo-item').length;
    document.querySelector('[data-page="memo"]').click();
    const scope = document.querySelector('[data-setting="memoScope"]');
    scope.value = 'both'; scope.dispatchEvent(new Event('change', {bubbles:true}));
    // Seed 15 is a legal scramble with an FR flip and two in-place twists.
    // No private memo words are required for a physical sticker-trace exercise.
    const savedRandom = Math.random;
    let randomState = 15;
    Math.random = () => ((randomState = (1664525 * randomState + 1013904223) >>> 0) / 4294967296);
    try { document.querySelector('[data-action="memo-start"]').click(); }
    finally { Math.random = savedRandom; }
    await wait(160);
    const cubeMemo = window.blindMemoQA().memo;
    assert(cubeMemo.edges.specials.some(item => item.kind === 'flip' && item.piece === 'FR'), 'Deterministic flipped-edge fixture missing');
    assert(cubeMemo.corners.specials.length === 2, 'Deterministic corner-twist fixture missing');
    assert(document.querySelectorAll('.memo-row').length === 2, 'Full memo rows did not render for memorisation');
    document.querySelector('[data-action="memo-stop"]').click();
    assert(window.blindMemoQA().memoPhase === 'answer', 'Full memo did not stop for answer entry');
    assert(!document.querySelector('.memo-row,.memo-step svg'), 'Memo prompt remains visible while entering the sequence');
    assert(document.querySelector('[name="edgesSpecial"]'), 'Flipped-edge answer field missing when this cube needs it');
    assert(document.querySelector('[name="cornersSpecial"]'), 'Corner-twist answer field missing when this cube needs it');
    for (const kind of ['corners','edges']) {
      document.querySelector('[name="' + kind + '"]').value = cubeMemo[kind].letters;
      document.querySelector('[name="' + kind + 'Special"]').value = cubeMemo[kind].specials.map(item => item.piece + (kind === 'corners' ? ' ' + item.direction : '')).join(', ');
    }
    document.querySelector('#memo-answer-form').dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
    assert(window.blindMemoQA().memoPhase === 'result', 'Full memo answer did not submit');
    assert(document.querySelector('.memo-result').textContent.includes('Correct sequence'), 'Correct orientation sequence was rejected');
    assert(document.querySelectorAll('.memo-row').length === 2, 'Memo diagrams did not return after checking the sequence');
    let finalSaved;
    for (let i = 0; i < 80; i++) {
      finalSaved = await window.cornerlabNative.load();
      if (finalSaved.memoHistory.length === 1) break;
      await wait(50);
    }
    assert(finalSaved.memoHistory.length === 1 && finalSaved.memoHistory[0].correct, 'Full memo result was not persisted');
    randomState = 1;
    Math.random = () => ((randomState = (1664525 * randomState + 1013904223) >>> 0) / 4294967296);
    try { document.querySelector('[data-action="memo-start"]').click(); }
    finally { Math.random = savedRandom; }
    await wait(160);
    const noFixMemo = window.blindMemoQA().memo;
    assert(noFixMemo.edges.specials.length === 0 && noFixMemo.corners.specials.length === 0, 'No-orientation fixture unexpectedly needs a fix');
    document.querySelector('[data-action="memo-stop"]').click();
    assert(!document.querySelector('[name="edgesSpecial"],[name="cornersSpecial"]'), 'Orientation fields should be omitted when this memo has no flips or twists');
    return {phase:'after-reload',restoredAttempts:loaded.history.length,libraryItems,fullMemoCorrect:true,flippedEdgeEntry:true,hiddenAnswerPrompt:true};
    """# }
}
