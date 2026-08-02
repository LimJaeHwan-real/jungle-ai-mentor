from pathlib import Path

from diagrams import Cluster, Diagram, Edge, Node
from diagrams.onprem.client import Users
from diagrams.onprem.database import PostgreSQL
from diagrams.onprem.vcs import Github
from diagrams.programming.framework import React
from diagrams.programming.language import NodeJS


OUTPUT_PATH = Path(__file__).with_name("architecture")

GRAPH_ATTRIBUTES = {
    "bgcolor": "white",
    "dpi": "192",
    "fontname": "Malgun Gothic Bold",
    "fontsize": "24",
    "labeljust": "c",
    "labelloc": "t",
    "nodesep": "0.72",
    "pad": "0.45",
    "ranksep": "1.05",
    "splines": "ortho",
}

NODE_ATTRIBUTES = {
    "fontname": "Malgun Gothic Bold",
    "fontsize": "12",
    "height": "1.05",
    "imagescale": "true",
    "labelloc": "b",
}

EDGE_ATTRIBUTES = {
    "arrowsize": "0.8",
    "color": "#334155",
    "fontcolor": "#1E293B",
    "fontname": "Malgun Gothic Bold",
    "fontsize": "10",
    "penwidth": "1.6",
}

REQUEST_EDGE = {"color": "#2563EB", "fontcolor": "#1D4ED8"}
AI_EDGE = {"color": "#7C3AED", "fontcolor": "#6D28D9"}
DATA_EDGE = {"color": "#059669", "fontcolor": "#047857"}
EXTERNAL_EDGE = {
    "color": "#D97706",
    "fontcolor": "#B45309",
    "style": "dashed",
}

FRONTEND_CLUSTER = {
    "bgcolor": "#F8FBFF",
    "color": "#38BDF8",
    "fillcolor": "#F8FBFF",
    "fontcolor": "#0369A1",
    "fontname": "Malgun Gothic Bold",
    "fontsize": "20",
    "margin": "24",
    "penwidth": "1.8",
    "style": "rounded,filled",
}

BACKEND_CLUSTER = {
    "bgcolor": "#FAF9FF",
    "color": "#8B5CF6",
    "fillcolor": "#FAF9FF",
    "fontcolor": "#6D28D9",
    "fontname": "Malgun Gothic Bold",
    "fontsize": "20",
    "margin": "24",
    "penwidth": "1.8",
    "style": "rounded,filled",
}

DATA_CLUSTER = {
    "bgcolor": "#F4FBF7",
    "color": "#22C55E",
    "fillcolor": "#F4FBF7",
    "fontcolor": "#15803D",
    "fontname": "Malgun Gothic Bold",
    "fontsize": "20",
    "margin": "24",
    "penwidth": "1.8",
    "style": "rounded,filled",
}

EXTERNAL_CLUSTER = {
    "bgcolor": "#FFFBF5",
    "color": "#F59E0B",
    "fillcolor": "#FFFBF5",
    "fontcolor": "#B45309",
    "fontname": "Malgun Gothic Bold",
    "fontsize": "20",
    "labelloc": "b",
    "margin": "24",
    "penwidth": "1.8",
    "style": "rounded,filled",
}


def text_box(label: str, *, border: str, fill: str, font: str) -> Node:
    return Node(
        label,
        shape="box",
        style="rounded,filled",
        color=border,
        fillcolor=fill,
        fontcolor=font,
        fontname="Malgun Gothic Bold",
        fontsize="12",
        height="0.82",
        width="1.85",
        margin="0.18,0.12",
        penwidth="1.6",
        labelloc="c",
    )


with Diagram(
    "정글 AI 멘토 아키텍처",
    filename=str(OUTPUT_PATH),
    outformat="png",
    show=False,
    direction="LR",
    graph_attr=GRAPH_ATTRIBUTES,
    node_attr=NODE_ATTRIBUTES,
    edge_attr=EDGE_ATTRIBUTES,
) as diagram:
    user = Users(
        "사용자",
        fontname="Malgun Gothic Bold",
        fontsize="16",
        fontcolor="#111827",
    )

    with Cluster("FrontEnd", direction="LR", graph_attr=FRONTEND_CLUSTER):
        frontend = React("React + Vite\nTypeScript")

    with Cluster("Backend / AI", direction="LR", graph_attr=BACKEND_CLUSTER):
        api = NodeJS("NestJS REST API\nJWT · CRUD")
        agent = text_box(
            "AgentService\nTool Routing",
            border="#8B5CF6",
            fill="#F3E8FF",
            font="#5B21B6",
        )
        rag = text_box(
            "RAG / FAQ Search\nChunk · Vector Search",
            border="#8B5CF6",
            fill="#F5F3FF",
            font="#5B21B6",
        )

    with Cluster("Data", direction="TB", graph_attr=DATA_CLUSTER):
        vector_data = PostgreSQL("PostgreSQL + pgvector\ndocuments · chunks")
        app_data = PostgreSQL("PostgreSQL 16\nusers · posts · faqs")

    with Cluster("External Services", direction="LR", graph_attr=EXTERNAL_CLUSTER):
        openai = text_box(
            "OpenAI API\nLLM · Embeddings",
            border="#374151",
            fill="#F9FAFB",
            font="#111827",
        )
        github = Github("GitHub REST API\nMCP Adapter")
        blog_search = text_box(
            "Blog Search\nRAG Fallback\nNaver · DuckDuckGo",
            border="#D97706",
            fill="#FFF7ED",
            font="#9A3412",
        )

    user >> Edge(label="웹 사용", **REQUEST_EDGE) >> frontend
    frontend >> Edge(**REQUEST_EDGE) >> api
    api >> Edge(label="질문 요청", **AI_EDGE) >> agent
    agent >> Edge(label="근거 검색", **AI_EDGE) >> rag

    api >> Edge(**DATA_EDGE) >> app_data
    rag >> Edge(label="vector · chunk", **DATA_EDGE) >> vector_data

    agent >> Edge(constraint="false", **EXTERNAL_EDGE) >> openai
    agent >> Edge(constraint="false", **EXTERNAL_EDGE) >> github
    vector_data >> Edge(style="invis", weight="20") >> app_data
    openai >> Edge(style="invis", weight="20") >> github
    github >> Edge(style="invis", weight="20") >> blog_search
    agent >> Edge(style="invis", weight="30") >> github
