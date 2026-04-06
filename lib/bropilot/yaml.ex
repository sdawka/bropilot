defmodule Bropilot.Yaml do
  @moduledoc """
  YAML encoding/decoding utilities.
  Uses yaml_elixir for parsing, custom encoder for writing.
  """

  def decode_file(path) do
    case YamlElixir.read_from_file(path) do
      {:ok, data} -> {:ok, data}
      {:error, reason} -> {:error, {:yaml_parse_error, path, reason}}
    end
  end

  def decode(string) do
    case YamlElixir.read_from_string(string) do
      {:ok, data} -> {:ok, data}
      {:error, reason} -> {:error, {:yaml_parse_error, reason}}
    end
  end

  def encode(data) do
    encode_value(data, 0)
  end

  def encode_to_file(data, path) do
    content = encode(data)
    File.write(path, content)
  end

  defp encode_value(value, _indent) when is_binary(value) do
    cond do
      String.contains?(value, "\n") ->
        "|\n" <> indent_multiline(value, 2)

      needs_quoting?(value) ->
        "\"" <> String.replace(value, "\"", "\\\"") <> "\""

      true ->
        value
    end
  end

  defp encode_value(value, _indent) when is_integer(value), do: Integer.to_string(value)
  defp encode_value(value, _indent) when is_float(value), do: Float.to_string(value)
  defp encode_value(true, _indent), do: "true"
  defp encode_value(false, _indent), do: "false"
  defp encode_value(nil, _indent), do: "null"

  defp encode_value(value, indent) when is_map(value) do
    value
    |> Enum.sort_by(fn {k, _} -> k end)
    |> Enum.map(fn {k, v} ->
      key = to_string(k)

      case v do
        v when is_map(v) and map_size(v) > 0 ->
          pad(indent) <> key <> ":\n" <> encode_value(v, indent + 2)

        v when is_list(v) and length(v) > 0 ->
          pad(indent) <> key <> ":\n" <> encode_value(v, indent + 2)

        _ ->
          pad(indent) <> key <> ": " <> encode_value(v, indent + 2)
      end
    end)
    |> Enum.join("\n")
  end

  defp encode_value([], _indent), do: "[]"

  defp encode_value(value, indent) when is_list(value) do
    value
    |> Enum.map(fn item ->
      case item do
        item when is_map(item) ->
          [first | rest] = encode_value(item, indent + 2) |> String.split("\n")
          first_trimmed = String.trim_leading(first)
          lines = [pad(indent) <> "- " <> first_trimmed | rest]
          Enum.join(lines, "\n")

        _ ->
          pad(indent) <> "- " <> encode_value(item, indent + 2)
      end
    end)
    |> Enum.join("\n")
  end

  defp encode_value(value, _indent), do: inspect(value)

  defp needs_quoting?(value) do
    String.contains?(value, ": ") or
      String.contains?(value, "#") or
      String.starts_with?(value, "- ") or
      String.starts_with?(value, "* ") or
      String.starts_with?(value, "? ") or
      String.starts_with?(value, "{") or
      String.starts_with?(value, "[") or
      String.starts_with?(value, "'") or
      String.starts_with?(value, "\"") or
      String.starts_with?(value, "@") or
      String.starts_with?(value, "`")
  end

  defp pad(n), do: String.duplicate(" ", n)

  defp indent_multiline(text, indent) do
    text
    |> String.split("\n")
    |> Enum.map(&(pad(indent) <> &1))
    |> Enum.join("\n")
  end
end
