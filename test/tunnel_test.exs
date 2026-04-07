defmodule Bropilot.TunnelTest do
  use ExUnit.Case

  alias Bropilot.Tunnel

  # ── available?/0 ────────────────────────────────────────────

  describe "available?/0" do
    test "returns a boolean" do
      result = Tunnel.available?()
      assert is_boolean(result)
    end

    test "returns true when cloudflared is installed" do
      if System.find_executable("cloudflared") do
        assert Tunnel.available?() == true
      end
    end

    test "reflects System.find_executable result" do
      expected = System.find_executable("cloudflared") != nil
      assert Tunnel.available?() == expected
    end
  end

  # ── GenServer startup ───────────────────────────────────────

  describe "GenServer behaviour" do
    test "starts without error and get_url returns nil when cloudflared is absent" do
      # Temporarily make cloudflared unfindable by using a bad PATH
      original_path = System.get_env("PATH")
      System.put_env("PATH", "/nonexistent")

      try do
        # Start a non-named instance to avoid conflicting with the supervised one
        assert {:ok, pid} =
                 GenServer.start_link(Tunnel, [port: 9999], [])

        assert is_pid(pid)
        assert Process.alive?(pid)

        # get_url on the unnamed instance returns nil
        assert GenServer.call(pid, :get_url) == nil

        GenServer.stop(pid, :normal)
      after
        System.put_env("PATH", original_path)
      end
    end

    test "get_url returns nil when tunnel not yet established" do
      # The supervised Tunnel may or may not have a URL depending on cloudflared.
      # This test verifies the API doesn't crash.
      result = Tunnel.get_url()
      assert is_nil(result) or is_binary(result)
    end
  end

  # ── URL parsing ─────────────────────────────────────────────

  describe "parse_tunnel_url/1" do
    test "extracts trycloudflare.com URL from typical output" do
      line =
        "2024-01-15T10:30:00Z INF +-----------------------------------------------------------+"

      assert Tunnel.parse_tunnel_url(line) == nil

      line = "2024-01-15T10:30:00Z INF |  https://some-random-words.trycloudflare.com  |"
      assert Tunnel.parse_tunnel_url(line) == "https://some-random-words.trycloudflare.com"
    end

    test "extracts URL with dashes" do
      line =
        "2024-01-15T10:30:01Z INF |  https://bright-fox-dancing-quietly.trycloudflare.com  |"

      assert Tunnel.parse_tunnel_url(line) ==
               "https://bright-fox-dancing-quietly.trycloudflare.com"
    end

    test "returns nil for non-URL lines" do
      assert Tunnel.parse_tunnel_url("Starting tunnel...") == nil
      assert Tunnel.parse_tunnel_url("") == nil
      assert Tunnel.parse_tunnel_url("INF Connected to the Cloudflare network") == nil
    end

    test "returns nil for non-trycloudflare URLs" do
      assert Tunnel.parse_tunnel_url("https://example.com") == nil
      assert Tunnel.parse_tunnel_url("https://google.com") == nil
    end

    test "handles URL embedded in log line" do
      line =
        "2024-01-15T10:30:00Z INF Registered tunnel connection connIndex=0 connection=abc url=https://test-tunnel-abc123.trycloudflare.com"

      assert Tunnel.parse_tunnel_url(line) == "https://test-tunnel-abc123.trycloudflare.com"
    end
  end

  # ── QR module ───────────────────────────────────────────────

  describe "Bropilot.QR.generate/1" do
    test "returns a string when qrencode is available" do
      if System.find_executable("qrencode") do
        result = Bropilot.QR.generate("https://example.com")
        assert is_binary(result)
        assert String.length(result) > 0
      end
    end

    test "returns nil when qrencode is unavailable" do
      original_path = System.get_env("PATH")
      System.put_env("PATH", "/nonexistent")

      try do
        assert Bropilot.QR.generate("https://example.com") == nil
      after
        System.put_env("PATH", original_path)
      end
    end
  end

  describe "Bropilot.QR.format/2" do
    test "returns empty string for nil input" do
      assert Bropilot.QR.format(nil, 4) == ""
    end

    test "indents each line with padding" do
      qr = "█▀█\n█▄█"
      result = Bropilot.QR.format(qr, 4)
      lines = String.split(result, "\n")
      assert Enum.all?(lines, &String.starts_with?(&1, "    "))
    end
  end
end
