defmodule Bropilot.Pipeline.Act1.Extractor do
  @moduledoc """
  Pure functions for building extraction prompts and parsing outputs for Act 1.
  Handles both Step 1 (basics) and Step 2 (gory detail) of vibe collection.
  """

  @doc """
  Builds the full extraction prompt for Step 1 by combining
  the recipe's step1 prompt markdown with the user's freeform input.
  """
  def build_step1_prompt(recipe_prompt, user_input) do
    """
    #{String.trim(recipe_prompt)}

    ---

    User's input:
    #{String.trim(user_input)}

    ---

    Extract the following fields as YAML:
    - name
    - purpose
    - problem
    - context
    - glossary_terms (list of {term, definition})
    """
  end

  @doc """
  Builds the full extraction prompt for Step 2 by combining
  the recipe's step2 prompt with the Q&A conversation pairs.
  """
  def build_step2_prompt(recipe_prompt, questions, answers) do
    qa_pairs =
      Enum.zip(questions, answers)
      |> Enum.map(fn {q, a} -> "Q: #{q}\nA: #{a}" end)
      |> Enum.join("\n\n")

    """
    #{String.trim(recipe_prompt)}

    ---

    Conversation:
    #{qa_pairs}

    ---

    Extract the following fields as YAML:
    - audience
    - use_cases (list)
    - capabilities (list)
    - design
    - volo
    - hypotheses (list)
    - assumptions (list)
    - glossary_terms (list of {term, definition})
    """
  end

  @doc """
  Parses extracted YAML string from Step 1 into a structured map.
  """
  def parse_step1_output(yaml_string) do
    Bropilot.Yaml.decode(yaml_string)
  end

  @doc """
  Parses extracted YAML string from Step 2 into a structured map.
  """
  def parse_step2_output(yaml_string) do
    Bropilot.Yaml.decode(yaml_string)
  end
end
