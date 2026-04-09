defmodule Bropilot.QR do
  @moduledoc """
  Generates a QR code string suitable for terminal display.

  Uses the `qrencode` CLI when available, otherwise falls back to a
  plain-text URL message.
  """

  @doc """
  Returns a terminal-friendly QR code string for `text`.

  When `qrencode` is installed the output uses UTF-8 block characters;
  otherwise returns `nil`.
  """
  @spec generate(String.t()) :: String.t() | nil
  def generate(text) when is_binary(text) do
    case System.find_executable("qrencode") do
      nil ->
        nil

      qrencode ->
        case System.cmd(qrencode, ["-t", "UTF8", "-m", "1", text], stderr_to_stdout: true) do
          {output, 0} -> String.trim_trailing(output)
          _ -> nil
        end
    end
  end

  @doc """
  Formats a QR code string (or nil) for display inside the startup banner.

  Each line is indented by `padding` spaces.
  """
  @spec format(String.t() | nil, non_neg_integer()) :: String.t()
  def format(nil, _padding), do: ""

  def format(qr_string, padding) when is_binary(qr_string) do
    pad = String.duplicate(" ", padding)

    qr_string
    |> String.split("\n")
    |> Enum.map_join("\n", fn line -> pad <> line end)
  end
end
