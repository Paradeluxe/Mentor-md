# -*- coding: utf-8 -*-
"""Prevention tests: sanitize + mark status + write_mentor no stale fuzzy."""
import json
import os
import tempfile
import zipfile
from pathlib import Path

import mentor_io as m

pass_n = 0
fail_n = 0


def t(name, fn):
    global pass_n, fail_n
    try:
        fn()
        print('  OK', name)
        pass_n += 1
    except Exception as e:
        print('  FAIL', name, ':', e)
        fail_n += 1


def test_mark_attached_clears_invalid():
    th = {'invalid': True, 'fuzzy': True, 'deleted': True, 'invalidReason': 'x',
          'anchor': {'status': 'orphaned'}}
    m._mark_thread_anchor_status(th, 'attached', None)
    assert th['invalid'] is False
    assert th['fuzzy'] is False
    assert th['deleted'] is False
    assert 'invalidReason' not in th
    assert th['anchor']['status'] == 'attached'
    assert th['anchor']['confidence'] == 1


def test_md_literal_n_init():
    vs = m.md_literal_variants('n_init = 10')
    assert 'n_init = 10' in vs
    assert any('n\\_init' in v or v == r'n\_init = 10' for v in vs)


def test_sanitize_aligns_escape():
    md = 'K-means (Euclidean distance, n\\_init = 10) applied.\n'
    ann = {'annotations': [{
        'threadId': 'abc123def456',
        'text': 'n_init = 10',
        'prefix': 'distance, ',
        'suffix': ') applied',
        'fuzzy': True,
        'invalid': True,
        'invalidReason': 'orphaned',
        'comments': [],
    }]}
    warns = m.sanitize_anchors_for_write(ann, md)
    th = ann['annotations'][0]
    assert th['text'] == r'n\_init = 10', th['text']
    assert th['fuzzy'] is False
    assert th['invalid'] is False
    assert md[th['mdRange']['from']:th['mdRange']['to']] == th['text']


def test_sanitize_bonferroni_md_form():
    md = (
        'did not survive (_F_(3, 195) = 2.68, _p_ = .048; '
        'Bonferroni-corrected _p_ = .19) or RT\n'
    )
    ann = {'annotations': [{
        'threadId': 'bbb123def456',
        'text': 'Bonferroni-corrected _p_ = .19',
        'prefix': '_p_ = .048; ',
        'suffix': ') or RT',
        'fuzzy': True,
        'comments': [],
    }]}
    m.sanitize_anchors_for_write(ann, md)
    th = ann['annotations'][0]
    assert th['fuzzy'] is False
    assert th['invalid'] is False
    assert th['text'] == 'Bonferroni-corrected _p_ = .19'
    assert 'Bonferroni' in th['text']


def test_write_mentor_sanitize_roundtrip():
    md = 'Hello unique-anchor-xyz world.\nSecond line n\\_init = 10 end.\n'
    ann = {
        'version': '1',
        'annotations': [
            {
                'threadId': 't11111111111',
                'text': 'unique-anchor-xyz',
                'prefix': 'Hello ',
                'suffix': ' world',
                'fuzzy': True,
                'invalid': True,
                'invalidReason': 'text-changed',
                'comments': [{'id': 'c1', 'author': {'id': 'u', 'name': 'U'},
                              'body': 'note', 'createdAt': m.now_iso()}],
            },
            {
                'threadId': 't22222222222',
                'text': 'n_init = 10',
                'prefix': 'line ',
                'suffix': ' end',
                'fuzzy': True,
                'comments': [],
            },
        ],
    }
    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, 'x.mentor')
        # seed zip
        with zipfile.ZipFile(p, 'w') as z:
            z.writestr('content.md', 'old')
            z.writestr('annotations.json', '{}')
        n = m.write_mentor(p, md, ann, block_on_unhealthy=True)
        assert n > 0
        md2, ann2 = m.read_mentor(p)
        assert md2 == md
        assert not any(t.get('fuzzy') for t in ann2['annotations'])
        assert not any(t.get('invalid') for t in ann2['annotations'])
        t2 = ann2['annotations'][1]
        assert t2['text'] == r'n\_init = 10'
        # content changed => no structural
        with zipfile.ZipFile(p) as z:
            names = z.namelist()
        assert 'document.html' not in names


def test_audit_uses_variants():
    md = 'param n\\_init = 10 here\n'
    ann = {'annotations': [{
        'threadId': 't33333333333',
        'text': 'n_init = 10',
        'prefix': 'param ',
        'suffix': ' here',
    }]}
    # before sanitize, audit should still attach via variants
    a = m.audit_anchor_health(ann, md)
    assert a['ok'], a
    assert 0 in a['attached']


if __name__ == '__main__':
    print('=== test_prevent_drift ===')
    t('mark attached clears invalid', test_mark_attached_clears_invalid)
    t('md literal n_init', test_md_literal_n_init)
    t('sanitize aligns escape', test_sanitize_aligns_escape)
    t('sanitize bonferroni', test_sanitize_bonferroni_md_form)
    t('write_mentor roundtrip', test_write_mentor_sanitize_roundtrip)
    t('audit variants', test_audit_uses_variants)
    print(f'=== RESULT {pass_n} pass / {fail_n} fail ===')
    raise SystemExit(1 if fail_n else 0)
