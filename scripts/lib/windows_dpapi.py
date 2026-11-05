"""Current-user Windows protection for local QA archives; no password files."""
import ctypes
from ctypes import wintypes

class Blob(ctypes.Structure):
    _fields_=[('size',wintypes.DWORD),('data',ctypes.POINTER(ctypes.c_ubyte))]

def _transform(data,purpose,decrypt):
    raw=ctypes.create_string_buffer(data);salt=ctypes.create_string_buffer(purpose)
    source=Blob(len(data),ctypes.cast(raw,ctypes.POINTER(ctypes.c_ubyte)))
    entropy=Blob(len(purpose),ctypes.cast(salt,ctypes.POINTER(ctypes.c_ubyte)));out=Blob()
    crypt=ctypes.WinDLL('crypt32',use_last_error=True);kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    fn=crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData
    fn.argtypes=[ctypes.POINTER(Blob),ctypes.c_void_p,ctypes.POINTER(Blob),ctypes.c_void_p,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(Blob)];fn.restype=wintypes.BOOL
    kernel.LocalFree.argtypes=[ctypes.c_void_p];kernel.LocalFree.restype=ctypes.c_void_p
    if not fn(ctypes.byref(source),None,ctypes.byref(entropy),None,None,1,ctypes.byref(out)):
        raise RuntimeError('WINDOWS_DPAPI_OPERATION_FAILED')
    try:return ctypes.string_at(out.data,out.size)
    finally:kernel.LocalFree(out.data)

def protect(data,purpose):return _transform(data,purpose,False)
def unprotect(data,purpose):return _transform(data,purpose,True)
