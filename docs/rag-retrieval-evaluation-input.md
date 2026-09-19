# RAG 검색 오프라인 평가 입력

`docs/rag-retrieval-evaluation-draft.md`에 확정한 질문·정답 자료·충분성 라벨을 사용해, 같은 문서 자료와 같은 질문에서 **기존 방식**(`baseline`)과 **변경 후보**(`candidate`)의 검색 결과를 각각 저장한다. 이 도구만으로 품질 합격을 선언할 수는 없으며, 실제 전후 결과와 운영 제약을 함께 검토한다.

입력은 JSON 파일이다. `id`는 질문 ID, `relevantDocumentIds`는 검토된 정답 문서 ID, `sufficient`는 답변할 근거가 있으면 `true`, 없으면 `false`, 모호하거나 미검토이면 `null`로 적는다. `results`는 검색 순서를 유지한다. 질문 본문·문서 본문·API 키는 입력에 넣지 않는다.

## 동일 조건 결과 수집

`rag:collect`는 확정한 Q01~Q11을 현재 로컬 자료에 한 번씩 적용해 기존 방식(`baseline`)과 개선 방식(`candidate`) 결과를 같은 JSON에 저장한다. 질문 embedding은 한 번의 batch 요청으로 만들고 두 방식이 공유한다. 개선 방식은 운영 `RagService`의 후보 검색과 근거 판정을 그대로 사용한다.

수집기는 DB에서 반복 읽기·읽기 전용 트랜잭션만 사용한다. 연결 초기화 전에 extension 설치, 스키마 동기화와 마이그레이션도 끈다. 출력에는 질문·문서 본문·답변·URL·환경 변수·API 키를 넣지 않고 평가용 ID와 라벨·상태만 넣는다. 기본 출력 폴더 `.rag-evaluation-results/`는 Git에서 제외된다.

실행에는 OpenAI에 최대 12회 요청한다. 11개 질문 embedding을 한 요청으로 보내고, 현재 검색의 근거 판정을 질문당 최대 한 번 수행한다. 자동 재시도와 웹 검색은 없으며 근거 판정 요청은 `store: false`다. 따라서 외부 전송·비용 범위를 승인한 검증 환경에서만 실행한다.

실행 위치는 `backend`이다.

```powershell
npm.cmd run rag:collect -- .rag-evaluation-results/retrieval.json
npm.cmd run rag:evaluate -- .rag-evaluation-results/retrieval.json
```

첫 명령이 실패하면 불완전한 결과를 평가하지 않는다. 수집 스크립트는 성공하기 전에는 결과 파일을 쓰지 않으며 오류 메시지에 질문·후보 본문·비밀값을 출력하지 않는다.

## 입력 형식

```json
{
  "k": 5,
  "cases": [
    {
      "id": "Q01",
      "relevantDocumentIds": ["검토된-문서-ID"],
      "sufficient": true,
      "baseline": {
        "status": "SUFFICIENT_EVIDENCE",
        "results": [{ "chunkId": "기존-chunk-ID", "documentId": "검토된-문서-ID" }]
      },
      "candidate": {
        "status": "SUFFICIENT_EVIDENCE",
        "results": [{ "chunkId": "변경-chunk-ID", "documentId": "검토된-문서-ID" }]
      }
    }
  ]
}
```

이미 확보한 결과를 직접 작성하거나 다른 환경의 결과를 평가할 때도 실행 위치는 `backend`이다.

```powershell
npm.cmd run rag:evaluate -- <평가-입력.json>
```

출력은 두 방식의 `Recall@k`, MRR, nDCG@k, 최상위 정답 문서 비율(`topSourceAccuracy`), 반환 결과 중 중복 문서 비율(`duplicateRate`), 근거 충분성 precision/recall을 각각 보여준다. 모호한 질문은 충분성 지표에서 제외하고, 정답 문서가 없는 질문은 검색 관련 지표에서 제외한다. 분모가 없으면 값을 `null`로 출력한다. 지표 계산과 배포 합격 기준 결정은 별개다.
