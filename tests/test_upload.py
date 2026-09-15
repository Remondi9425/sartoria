"""What is allowed to reach a GPU.

An unknown extension was renamed .mp4 and sent anyway, so the admission policy
was really "anything under 80 MB".
"""
import pytest

from spike.serve import sniff_container

MP4 = b"\x00\x00\x00\x20ftypisom" + b"\x00" * 64
MOV = b"\x00\x00\x00\x14ftypqt  " + b"\x00" * 64
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 64
AVI = b"RIFF\x00\x00\x00\x00AVI LIST" + b"\x00" * 64


@pytest.mark.parametrize("data,expected", [
    (MP4, ".mp4"), (MOV, ".mp4"), (WEBM, ".webm"), (AVI, ".avi"),
])
def test_real_containers_are_recognised(data, expected):
    assert sniff_container(data) == expected


@pytest.mark.parametrize("data", [
    b"", b"not a video at all", b"\x89PNG\r\n\x1a\n" + b"\x00" * 64,
    b"%PDF-1.7" + b"\x00" * 64, b"PK\x03\x04" + b"\x00" * 64,
    b"\x7fELF" + b"\x00" * 64, b"\x00" * 128,
])
def test_anything_else_is_refused(data):
    assert sniff_container(data) is None


def test_a_video_name_on_other_bytes_does_not_help():
    """The name is never consulted — this is the case that used to pass."""
    assert sniff_container(b"#!/bin/sh\nrm -rf /\n" + b"\x00" * 64) is None
