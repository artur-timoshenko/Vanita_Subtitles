@echo off
setlocal
echo Install local speech timing: Python packages and the multilingual small model.
echo Internet is required for setup. Your project's audio is not uploaded.
set "SPEECH_ENV=%LOCALAPPDATA%\Neura_Subtitles\speech-venv"
if exist "%SPEECH_ENV%\Scripts\python.exe" goto deps
py -3.11 -m venv "%SPEECH_ENV%" || python -m venv "%SPEECH_ENV%" || goto failed
:deps
"%SPEECH_ENV%\Scripts\python.exe" -m pip install "faster-whisper==1.2.1" || goto failed
"%SPEECH_ENV%\Scripts\python.exe" -c "from faster_whisper import WhisperModel; WhisperModel('small',device='cpu',compute_type='int8')" || goto failed
echo Audio timing is ready. Return to Premiere.
pause
exit /b 0
:failed
echo Setup failed. Check the error above, Python 3.11, internet and free disk space.
pause
exit /b 1
