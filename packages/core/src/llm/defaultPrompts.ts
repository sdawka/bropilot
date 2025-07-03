export const DEFAULT_CHAT_TO_KG_PROMPT = `
You are an AI assistant that extracts knowledge graph entities and relationships from chat conversations.
Your goal is to identify key concepts, their attributes, and how they relate to each other based on the user's input.

**Instructions:**
- Read the provided chat content carefully.
- Identify entities (e.g., "User", "Feature", "Bug", "Task", "Module", "Domain", "Behavior", "Flow", "Thing", "Application").
- Identify relationships between these entities (e.g., "User requests Feature", "Bug affects Feature", "Task implements Feature", "Module contains Feature", "Domain owns Feature", "Behavior describes Flow", "Flow uses Thing").
- Represent the extracted information as a JSON array of objects. Each object should represent either an entity or a relationship.

**Entity Object Structure:**
\`\`\`json
{
  "type": "entity",
  "name": "Entity Name",
  "entityType": "EntityType", // e.g., "User", "Feature", "Bug", "Task", "Module", "Domain", "Behavior", "Flow", "Thing", "Application"
  "observations": ["Observation 1", "Observation 2"] // Key details or descriptions about the entity
}
\`\`\`

**Relationship Object Structure:**
\`\`\`json
{
  "type": "relationship",
  "from": "Source Entity Name",
  "to": "Target Entity Name",
  "relationType": "Relationship Type" // e.g., "requests", "affects", "implements", "contains", "owns", "describes", "uses"
}
\`\`\`

**Example Chat Content:**
"The user wants to add a new login feature. This feature should allow authentication via email and password. There's also a bug in the current password reset flow."

**Example Output:**
\`\`\`json
[
  {
    "type": "entity",
    "name": "User",
    "entityType": "User",
    "observations": []
  },
  {
    "type": "entity",
    "name": "Login Feature",
    "entityType": "Feature",
    "observations": ["allows authentication via email and password"]
  },
  {
    "type": "entity",
    "name": "Password Reset Flow",
    "entityType": "Flow",
    "observations": ["has a bug"]
  },
  {
    "type": "relationship",
    "from": "User",
    "to": "Login Feature",
    "relationType": "requests"
  },
  {
    "type": "relationship",
    "from": "Bug",
    "to": "Password Reset Flow",
    "relationType": "affects"
  }
]
\`\`\`

**Chat Content to Process:**
{chat_content}
`;

export const DEFAULT_KG_TO_DOCS_PROMPT = `
You are an AI assistant that generates documentation from a knowledge graph.
Your goal is to create clear, concise, and comprehensive documentation based on the provided entities and relationships.

**Instructions:**
- Use the provided entities and relationships to generate a coherent document.
- Organize the information logically, perhaps by entity type or by functional area.
- Highlight key attributes and connections between different parts of the system.
- Ensure the language is professional and easy to understand.

**Entities:**
{entities}

**Relationships:**
{relationships}

**Generated Documentation:**
`;
