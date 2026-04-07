defmodule Bropilot.Spaces.Space do
  @moduledoc """
  Defines a single immutable space with its contract.
  """

  @enforce_keys [:id, :name, :description, :governs, :required_slots, :cross_cutting?]
  defstruct [:id, :name, :description, :governs, :required_slots, :cross_cutting?]

  @type slot :: %{
          id: atom(),
          name: String.t(),
          type: :file | :directory,
          required: boolean()
        }

  @type t :: %__MODULE__{
          id: atom(),
          name: String.t(),
          description: String.t(),
          governs: String.t(),
          required_slots: [slot()],
          cross_cutting?: boolean()
        }
end
