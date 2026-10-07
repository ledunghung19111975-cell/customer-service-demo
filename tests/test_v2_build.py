"""产出 Agent：Codex；避免旧入口被构建为误标 V2 的产物。"""
import importlib.util
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('v2_build', ROOT / 'build_v2.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class BuildTests(unittest.TestCase):
    def test_old_entry_rejected_without_overwriting_bundle(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'index.html').write_bytes((ROOT / 'ecommerce-v1.html').read_bytes())
            (root / 'dist').mkdir()
            bundle = root / 'dist/智能客服_V2.html'
            bundle.write_bytes(b'keep existing output')
            with self.assertRaises(ValueError):
                builder.build(root)
            self.assertEqual(bundle.read_bytes(), b'keep existing output')

    def test_v2_bundle_contains_current_lock_and_no_external_runtime(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'index.html').write_bytes((ROOT / 'index.html').read_bytes())
            shutil.copytree(ROOT / 'src/v2', root / 'src/v2')
            text = builder.build(root).read_text(encoding='utf-8')
            self.assertIn('navigator.locks.request', text)
            self.assertIn('support-ecommerce-v2', text)
            self.assertNotIn('<script src=', text)
            self.assertNotIn('<link rel="stylesheet"', text)

if __name__ == '__main__':
    unittest.main()
