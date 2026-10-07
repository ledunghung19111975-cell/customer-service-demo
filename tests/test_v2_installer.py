"""Safe overlay tests using the verified original entry and isolated temp dirs."""
from pathlib import Path
import importlib.util
import shutil
import tempfile
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('v2_installer',ROOT/'apply_v2.py')
installer=importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
BASE=(ROOT/'tests/fixtures/v2-base-index.html').read_bytes()

class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.repo=Path(self.temp.name)/'repo';self.repo.mkdir()
        (self.repo/'index.html').write_bytes(BASE)
        (self.repo/'src').mkdir();(self.repo/'src/domain.js').write_text('ORIGINAL MODULE',encoding='utf-8')
    def tearDown(self):self.temp.cleanup()
    def snapshot(self):return {str(p.relative_to(self.repo)):p.read_bytes() for p in self.repo.rglob('*') if p.is_file()}
    def test_01_verified_original_fixture(self):
        self.assertEqual(installer.blob_sha(BASE),installer.BASE_INDEX_SHA)
    def test_02_dry_run_does_not_write(self):
        before=self.snapshot();result=installer.apply(ROOT,self.repo,dry_run=True)
        self.assertIn('index.html',result);self.assertEqual(self.snapshot(),before)
    def test_03_apply_idempotent_preserves_original(self):
        installer.apply(ROOT,self.repo)
        self.assertEqual((self.repo/'ecommerce-v1.html').read_bytes(),BASE)
        self.assertEqual((self.repo/'src/domain.js').read_text(),'ORIGINAL MODULE')
        self.assertEqual((self.repo/'index.html').read_bytes(),(ROOT/'index.html').read_bytes())
        before=self.snapshot();installer.apply(ROOT,self.repo);self.assertEqual(self.snapshot(),before)
    def test_04_wrong_entry_has_no_effect(self):
        (self.repo/'index.html').write_text('someone changed this',encoding='utf-8');before=self.snapshot()
        with self.assertRaises(ValueError):installer.apply(ROOT,self.repo)
        self.assertEqual(self.snapshot(),before)
    def test_05_conflicting_file_has_no_partial_effect(self):
        (self.repo/'src/v2').mkdir();(self.repo/'src/v2/model.js').write_text('CUSTOM',encoding='utf-8');before=self.snapshot()
        with self.assertRaises(ValueError):installer.apply(ROOT,self.repo)
        self.assertEqual(self.snapshot(),before)
    def test_06_restore_entry_preserves_new_sources_and_can_reapply(self):
        installer.apply(ROOT,self.repo);installer.apply(ROOT,self.repo,restore_entry=True)
        self.assertEqual((self.repo/'index.html').read_bytes(),BASE)
        self.assertTrue((self.repo/'src/v2/service.js').is_file())
        installer.apply(ROOT,self.repo)
        self.assertEqual((self.repo/'index.html').read_bytes(),(ROOT/'index.html').read_bytes())
    def test_07_backup_conflict_stops_before_writing(self):
        (self.repo/'ecommerce-v1.html').write_text('OTHER BACKUP',encoding='utf-8');before=self.snapshot()
        with self.assertRaises(ValueError):installer.apply(ROOT,self.repo)
        self.assertEqual(self.snapshot(),before)
    def test_08_symlink_destination_is_rejected(self):
        outside=Path(self.temp.name)/'outside';outside.mkdir();(self.repo/'src/v2').symlink_to(outside,target_is_directory=True)
        with self.assertRaises(ValueError):installer.apply(ROOT,self.repo)
        self.assertEqual((self.repo/'index.html').read_bytes(),BASE);self.assertFalse(list(outside.iterdir()))
    def test_09_rollback_after_write_exception(self):
        before=self.snapshot();real=installer.atomic_write;count=0
        def fail_third(path,data):
            nonlocal count
            count+=1
            if count==3:raise OSError('injected disk error')
            real(path,data)
        with patch.object(installer,'atomic_write',side_effect=fail_third):
            with self.assertRaises(OSError):installer.apply(ROOT,self.repo)
        self.assertEqual(self.snapshot(),before)
    def test_10_crlf_original_is_preserved_in_backup(self):
        crlf=BASE.replace(b'\n',b'\r\n');(self.repo/'index.html').write_bytes(crlf)
        installer.apply(ROOT,self.repo)
        self.assertEqual((self.repo/'ecommerce-v1.html').read_bytes(),crlf)
    def test_11_altered_payload_is_rejected(self):
        package=Path(self.temp.name)/'package';shutil.copytree(ROOT,package)
        (package/'src/v2/model.js').write_text('CHANGED',encoding='utf-8');before=self.snapshot()
        with self.assertRaises(ValueError):installer.apply(package,self.repo)
        self.assertEqual(self.snapshot(),before)
    def test_12_restore_does_not_overwrite_custom_entry(self):
        installer.apply(ROOT,self.repo);(self.repo/'index.html').write_text('CUSTOM ENTRY',encoding='utf-8');before=self.snapshot()
        with self.assertRaises(ValueError):installer.apply(ROOT,self.repo,restore_entry=True)
        self.assertEqual(self.snapshot(),before)

if __name__=='__main__':unittest.main()
