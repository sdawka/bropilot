defmodule Bropilot.Recipe.Schema do
  @moduledoc """
  Validates map data against recipe schemas loaded from .schema.yaml files.
  Checks required fields, types, enum values, and ref format.
  """

  alias Bropilot.Yaml

  @doc """
  Loads a .schema.yaml file and returns the parsed schema map.
  """
  def load_schema(schema_path) do
    Yaml.decode_file(schema_path)
  end

  @doc """
  Validates a map of data against a schema definition.

  Returns `:ok` or `{:error, errors}` where errors is a list of
  `{field_name, reason}` tuples.
  """
  def validate(data, schema) when is_map(data) and is_map(schema) do
    fields = Map.get(schema, "fields", %{})

    errors =
      fields
      |> Enum.flat_map(fn {field_name, field_def} ->
        validate_field(field_name, Map.get(data, field_name), field_def)
      end)

    case errors do
      [] -> :ok
      errors -> {:error, errors}
    end
  end

  def validate(_data, _schema), do: {:error, [{:data, "must be a map"}]}

  @doc """
  Loads the appropriate schema for a map slot and validates the data against it.

  - `map_dir` - path to the map directory
  - `space` - space atom (e.g. :solution)
  - `slot` - slot atom (e.g. :specs)
  - `recipe_dir` - path to the recipe directory
  """
  def validate_map_slot(map_dir, space, slot, recipe_dir) do
    schema_path = find_schema_path(recipe_dir, space, slot)

    with {:ok, schema} <- load_schema(schema_path),
         {:ok, data} <- Bropilot.Storage.read(map_dir, space, slot) do
      validate(data, schema)
    end
  end

  # --- Private ---

  defp validate_field(field_name, value, field_def) do
    required? = Map.get(field_def, "required", false)
    type = Map.get(field_def, "type", "string")

    cond do
      is_nil(value) and required? ->
        [{field_name, :required}]

      is_nil(value) ->
        []

      true ->
        validate_type(field_name, value, type, field_def)
    end
  end

  defp validate_type(field_name, value, "string", _field_def) do
    if is_binary(value), do: [], else: [{field_name, {:type_mismatch, :string, value}}]
  end

  defp validate_type(field_name, value, "text", _field_def) do
    if is_binary(value), do: [], else: [{field_name, {:type_mismatch, :text, value}}]
  end

  defp validate_type(field_name, value, "boolean", _field_def) do
    if is_boolean(value), do: [], else: [{field_name, {:type_mismatch, :boolean, value}}]
  end

  defp validate_type(field_name, value, "enum", field_def) do
    allowed = Map.get(field_def, "values", [])

    cond do
      not is_binary(value) and not is_atom(value) ->
        [{field_name, {:type_mismatch, :enum, value}}]

      to_string(value) not in Enum.map(allowed, &to_string/1) ->
        [{field_name, {:invalid_enum, value, allowed}}]

      true ->
        []
    end
  end

  defp validate_type(field_name, value, "list", field_def) do
    if is_list(value) do
      item_type = Map.get(field_def, "item_type", "string")
      item_fields = Map.get(field_def, "item_fields")

      value
      |> Enum.with_index()
      |> Enum.flat_map(fn {item, idx} ->
        item_name = "#{field_name}[#{idx}]"

        if item_type == "map" and is_map(item_fields) do
          validate_map_items(item_name, item, item_fields)
        else
          validate_type(item_name, item, item_type, field_def)
        end
      end)
    else
      [{field_name, {:type_mismatch, :list, value}}]
    end
  end

  defp validate_type(field_name, value, "map", _field_def) do
    if is_map(value), do: [], else: [{field_name, {:type_mismatch, :map, value}}]
  end

  defp validate_type(field_name, value, "ref", _field_def) do
    if is_binary(value), do: [], else: [{field_name, {:type_mismatch, :ref, value}}]
  end

  defp validate_type(field_name, value, "any", _field_def) do
    if is_nil(value), do: [{field_name, {:type_mismatch, :any, value}}], else: []
  end

  defp validate_type(_field_name, _value, _type, _field_def) do
    # Unknown type — pass through
    []
  end

  defp validate_map_items(prefix, item, item_fields) when is_map(item) do
    Enum.flat_map(item_fields, fn {field_name, field_def} ->
      full_name = "#{prefix}.#{field_name}"
      validate_field(full_name, Map.get(item, field_name), field_def)
    end)
  end

  defp validate_map_items(prefix, _item, _item_fields) do
    [{prefix, {:type_mismatch, :map, :not_a_map}}]
  end

  defp find_schema_path(recipe_dir, space, slot) do
    Path.join([recipe_dir, "schemas", Atom.to_string(space), "#{Atom.to_string(slot)}.schema.yaml"])
  end
end
