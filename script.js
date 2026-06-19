const canvasStream = canvas.captureStream(30);
const flippedVideoTrack = canvasStream.getVideoTracks()[0];

// 실제 마이크의 오디오 트랙 가져오 warmed up
const audioTracks = stream.getAudioTracks();

// 새로운 미디어 스트림 생성 시 마이크 트랙과 캔버스 비디오 트랙을 함께 묶어줍니다.
const tracksToCombine = [flippedVideoTrack];
if (audioTracks.length > 0) {
    tracksToCombine.push(audioTracks[0]);
}
const combinedStream = new MediaStream(tracksToCombine);

// 오디오가 포함되므로 마임타입을 명확히 지정해 주는 것이 안전합니다.
function getSupportedMimeTypeWithAudio() {
    const types = [
        'video/mp4;codecs=avc1,mp4a.40.2', // 오디오 코덱 명시
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm'
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
}

const mimeType = getSupportedMimeTypeWithAudio();
const options = mimeType ? { mimeType } : {};
mediaRecorder = new MediaRecorder(combinedStream, options);
