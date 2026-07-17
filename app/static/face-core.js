import {
    FaceLandmarker,
    FilesetResolver,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304";

// MediaPipeの実行に必要なWebAssemblyファイルの取得先。
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";

// 本人識別用のface-apiモデルを取得するCDN。
const FACE_API_MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";

// AIモデルの読み込み結果を保存する。
// 画面更新ごとに重いモデルを再読み込みしないためPromiseを使い回す。
let landmarkerPromise;
let recognitionModelsPromise;

export async function getLandmarker() {
    if (!landmarkerPromise) {
        landmarkerPromise = (async () => {
            const vision = await FilesetResolver.forVisionTasks(WASM_URL);

            return FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: "/face-model",
                    delegate: "CPU",
                },
                runningMode: "VIDEO",
                numFaces: 1,
                outputFaceBlendshapes: true,
            });
        })();
    }

    return landmarkerPromise;
}

export async function startCamera(video) {
    if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("このブラウザではカメラを利用できません。");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: "user",
        },
        audio: false,
    });

    video.srcObject = stream;
    await video.play();

    return stream;
}

function euclideanDistance(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
        return Number.POSITIVE_INFINITY;
    }

    return Math.sqrt(
        a.reduce((sum, value, index) => {
            const difference = value - b[index];
            return sum + difference * difference;
        }, 0)
    );
}
// authのログインするときの比較
// export function compareEmbeddings(registeredTemplates, currentTemplates) {
//     if (
//         !Array.isArray(registeredTemplates) ||
//         !Array.isArray(currentTemplates) ||
//         registeredTemplates.length < 5 ||
//         currentTemplates.length < 5
//     ) {
//         return {
//             matched: false,
//             similarity: 0,
//             passedSamples: 0,
//         };
//     }

//     const nearestDistances = currentTemplates.map((current) => {
//         return Math.min(
//             ...registeredTemplates.map((registered) => {
//                 return euclideanDistance(registered, current);
//             })
//         );
//     });

//     const passedSamples = nearestDistances.filter((distance) => distance <= 0.36).length;

//     const averageDistance =
//         nearestDistances.reduce((sum, value) => sum + value, 0) /
//         nearestDistances.length;

//     const worstDistance = Math.max(...nearestDistances);

//     const similarity = Math.max(0, Math.min(1, 1 - averageDistance));

//     return {
//         matched:
//             passedSamples === currentTemplates.length &&
//             averageDistance <= 0.32 &&
//             worstDistance <= 0.36,
//         similarity,
//         passedSamples,
//         worstDistance,
//     };
// }

export async function captureEmbedding(video, onProgress) {
    if (!globalThis.faceapi) {
        throw new Error("顔認証AIを読み込めませんでした。インターネット接続を確認してください。");
    }

    if (!recognitionModelsPromise) {
        recognitionModelsPromise = Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(FACE_API_MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_MODEL_URL),
        ]);
    }

    await recognitionModelsPromise;

    const samples = [];
    const targetSamples = 7;
    const startedAt = performance.now();

    const detectorOptions = new faceapi.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: 0.5,
    });

    while (samples.length < targetSamples && performance.now() - startedAt < 12000) {
        const result = await faceapi
            .detectSingleFace(video, detectorOptions)
            .withFaceLandmarks()
            .withFaceDescriptor();

        if (result?.descriptor) {
            samples.push(Array.from(result.descriptor));
            onProgress?.(samples.length, targetSamples);
        }

        await new Promise((resolve) => setTimeout(resolve, 180));
    }

    if (samples.length < targetSamples) {
        throw new Error("本人識別用の顔データを取得できません。顔全体を明るく映してください。");
    }

    return samples;
}

export function stopCamera(video) {
    const stream = video.srcObject;

    if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        video.srcObject = null;
    }
}