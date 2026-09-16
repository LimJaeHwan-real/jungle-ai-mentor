# RAG 검색 오프라인 평가 입력

`docs/rag-retrieval-evaluation-draft.md`의 질문·정답 자료·충분성 라벨을 검토한 뒤, 같은 문서 자료와 같은 질문에서 **기존 방식**(`baseline`)과 **변경 후보**(`candidate`)의 검색 결과를 각각 저장한다. 초안의 후보 라벨은 아직 확정 정답이 아니며, 이 도구만으로 품질 합격을 선언할 수 없다.

입력은 JSON 파일이다. `id`는 질문 ID, `relevantDocumentIds`는 검토된 정답 문서 ID, `sufficient`는 답변할 근거가 있으면 `true`, 없으면 `false`, 모호하거나 미검토이면 `null`로 적는다. `results`는 검색 순서를 유지한다. 질문 본문·문서 본문·API 키는 입력에 넣지 않는다.

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

실행 위치는 `backend`이다.

```powershell
npm.cmd run rag:evaluate -- <평가-입력.json>
```

출력은 두 방식의 `Recall@k`, MRR, nDCG@k, 최상위 정답 문서 비율(`topSourceAccuracy`), 반환 결과 중 중복 문서 비율(`duplicateRate`), 근거 충분성 precision/recall을 각각 보여준다. 모호한 질문은 충분성 지표에서 제외하고, 정답 문서가 없는 질문은 검색 관련 지표에서 제외한다. 분모가 없으면 값을 `null`로 출력한다. 지표 계산과 배포 합격 기준 결정은 별개다.
