from pathlib import Path

from diagrams import Cluster, Diagram, Edge
from diagrams.onprem.client import Users
from diagrams.onprem.database import PostgreSQL
from diagrams.onprem.vcs import Github
from diagrams.programming.flowchart import Action, Decision, StoredData
from diagrams.programming.framework import React
from diagrams.programming.language import NodeJS


OUTPUT_PATH = Path(__file__).with_name("architecture")

GRAPH_ATTRIBUTES = {
    "bgcolor": "white",
    "fontname": "Malgun Gothic",
    "fontsize": "18",
    "labeljust": "c",
    "labelloc": "t",
    "nodesep": "0.60",
    "pad": "0.35",
    "ranksep": "0.75",
    "splines": "polyline",
}

NODE_ATTRIBUTES = {
    "fontname": "Malgun Gothic",
    "fontsize": "11",
}

EDGE_ATTRIBUTES = {
    "color": "#64748B",
    "fontcolor": "#334155",
    "fontname": "Malgun Gothic",
    "fontsize": "9",
    "penwidth": "1.4",
}

REQUEST_EDGE = {"color": "#2563EB", "fontcolor": "#1E3A8A"}
DATA_EDGE = {"color": "#0F766E", "fontcolor": "#115E59"}
EXTERNAL_EDGE = {
    "color": "#7C3AED",
    "constraint": "false",
    "fontcolor": "#5B21B6",
    "style": "dashed",
}


with Diagram(
    "정글 AI 멘토 아키텍처",
    filename=str(OUTPUT_PATH),
    outformat="png",
    show=False,
    direction="LR",
    graph_attr=GRAPH_ATTRIBUTES,
    node_attr=NODE_ATTRIBUTES,
    edge_attr=EDGE_ATTRIBUTES,
):
    user = Users("사용자")
    frontend = React("React + Vite\nTypeScript")
    api = NodeJS("NestJS REST API\nNode.js + TypeScript")
    agent = Decision("AgentService\nTool Routing")
    rag = StoredData("RAG / FAQ Search\nChunking · Vector Search")
    with Cluster("PostgreSQL 16 + pgvector", direction="TB"):
        app_data = PostgreSQL("Relational Data\nusers · posts · faqs")
        vector_data = StoredData("Vector Data\ndocuments · chunks")

    with Cluster("External APIs", direction="TB"):
        openai = Action("OpenAI API\nLLM · Embeddings")
        github = Github("GitHub REST API\nMCP Adapter")
        blog_search = Action("Blog Search\nNaver · DuckDuckGo")

    user >> Edge(label="웹 사용", **REQUEST_EDGE) >> frontend
    frontend >> Edge(label="REST API · JWT", **REQUEST_EDGE) >> api
    api >> Edge(label="/api/ai/ask", **REQUEST_EDGE) >> agent
    agent >> Edge(weight="10", **REQUEST_EDGE) >> rag

    api >> Edge(label="CRUD", constraint="false", **DATA_EDGE) >> app_data
    rag >> Edge(label="vector · chunk", **DATA_EDGE) >> vector_data

    agent >> Edge(label="답변 · embedding", **EXTERNAL_EDGE) >> openai
    agent >> Edge(label="저장소 분석", **EXTERNAL_EDGE) >> github
    agent >> Edge(label="근거 부족 시 검색", **EXTERNAL_EDGE) >> blog_search
    blog_search >> Edge(label="본문 인덱싱", constraint="false", **DATA_EDGE) >> rag
